# 谱面渲染性能量化

## 标准跑分

```sh
# 生产构建、固定压测谱面、完整预热一轮、五轮取中位数
yarn chart:bench --out .bench/current.json

# 修改前后对照
yarn chart:bench --out .bench/after.json --compare .bench/before.json
```

标准跑分不下载线上谱面或音乐。它使用版本化的 `LXNS Renderer Stress` 合成谱面：240 BPM、20 个有效小节、5440 个渲染 Note，覆盖 tap / break / EX / hold / touch / touch hold、烟花、旋转星星和全部 13 种 slide path；密度高于正常谱面。固定参数为 1440 逻辑像素、DPR 1.3、120 个谱面采样点/秒、全部视觉效果开启。

分数单位是 **stress frames/s，越高越好**。先用完整谱面跑一轮不计分预热，再正式测五轮。每轮把整张压测谱面尽快连续渲染，每帧向一个独立的栅栏 Canvas 像素写入当前画面，并在轮末读回栅栏，确保中途画面不会因下一帧 clear 被浏览器丢弃，也确保 Canvas 命令和 GPU 光栅化全部完成；`1000 / 全轮平均 ms/frame` 是该轮分数，最终成绩取五轮中位数。正式跑分关闭逐阶段 profiler，之后另跑一轮生成 CPU 阶段诊断，因此打点开销不会进入主分数。

结果会记录压测谱面版本、内容 hash、浏览器版本和 GPU renderer，不同 hash、画布、采样设置或运行环境会拒绝对比。`spread` 是五轮最高与最低分之差占中位数的比例，`RSD` 是各轮相对标准差；RSD 超过 5% 会把结果标成 `UNSTABLE`。

> **单次跑分只能读绝对量级，不能用来判断优化是否有效。** 同一份代码在本机不同会话实测出 127 / 181 / 257 stress fps，最大差近 2 倍；同一会话内连续跑分还会热降频，基线单调从 137 掉到 96 fps。因此**任何"改动前后"结论都必须走 [配对对照](#配对对照唯一可信的前后判定)**，`--compare` 只适合读同一次配对运行里的两侧数据。

## 工具层级

从"看一眼"到"可复现对照"：

| 层           | 入口                                                                                                            | 用途                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实时面板     | `yarn dev` → `/chart` 右上角 DEV 角标 → 展开 → **Frame Profile (CPU)**                                          | 播放中看各阶段 avg/max（250ms 窗口），定位当前瓶颈                                                                                                                         |
| 标准跑分     | `yarn chart:bench`                                                                                              | 生产构建 + 固定压测谱面，输出可长期对照的中位成绩、五轮离散度和阶段诊断                                                                                                    |
| **配对对照** | `yarn chart:bench:paired --baseline <checkout>`                                                                 | 同一 Chromium、同一页面内交错跑两份生产构建，输出配对 delta 的 95% 置信区间。**唯一可用来判定优化有效性的入口**                                                            |
| 像素回归     | `yarn chart:visual --out <dir> --compare <dir>`                                                                 | 13 个固定谱面时刻截图，先验证同构建重复捕获逐像素一致，再与基线目录逐像素比对并按预算判定                                                                                  |
| 页面内基准   | DevTools console：`await __chartBench.run({...})`                                                               | 不依赖播放/音频/rAF，按固定步进渲染一段谱面，输出各阶段 p50/p95/p99/max + 最重帧列表                                                                                       |
| 无头基准     | `node scripts/chart-bench.mjs --chart <id> ...`                                                                 | 从 shell 一条命令跑完，可 `--out` 存 JSON、`--compare` 对照，供 agent 做改动前后验证                                                                                       |
| 真实播放剖析 | `node scripts/chart-bench.mjs --chart <id> --playback --fullscreen` 或 console `__chartBench.profilePlayback()` | 真的走 rAF + 音频时钟 + 合成，逐帧记录 rAF 间隔与 CPU 耗时，报告掉帧率、掉帧时刻、该帧 CPU 占比、以及那一帧间隔内发生的 store 写入。回答"掉帧是 JS、GPU 还是 React 重渲染" |
| Chrome trace | 上面任一模式加 `--trace .bench/x.json`                                                                          | 导出含 GPU / GC / JS 采样栈的 trace；脚本直接打印主线程长任务（> 8ms）及每个长任务里占比最高的应用代码帧。拖进 DevTools Performance 面板可看火焰图                         |

## 配对对照（唯一可信的前后判定）

```sh
# A = 基线 checkout（另一个 worktree），B = 当前 checkout；各自 vike build 后交错跑
yarn chart:bench:paired --baseline /tmp/bench-baseline --rounds 4 --out .bench/paired.json

# 已经各自构建好时跳过构建
yarn chart:bench:paired --skip-build --baseline /tmp/bench-baseline --candidate . --rounds 4
```

为什么必须配对：stress 分数的绝对值受机器状态支配，跨会话能差 2 倍，会话内还随温度单调漂移。配对设计把两份构建放进**同一个 Chromium 进程、同一个页面**，只切换 localhost 端口（两份 `dist/client` 由两个 `vite preview` 提供），让两侧共享同一时刻的机器状态。

- **AB / BA 交错。** 未达热稳态时顺序会系统性偏置：同一个改动在 AB 轮测出 `+7.2%`、紧随其后的 BA 轮测出 `+34.1%`。交错让漂移一阶抵消，两种顺序结果不一致就说明还没到稳态。
- **热身轮不计分。** `--warmup-rounds`（默认 1）先跑完整轮把 GPU / JIT / 温度带到稳态。热身不足时置信区间会被单个离群轮撑爆。
- **判定看配对 log-ratio 的 95% 置信区间**，不看单轮百分比。区间整体 > 0 才是 `improvement`，整体 < 0 才是 `regression`，跨过 0 就是 `inconclusive`——此时结论是"没测出来"，不是"没有效果"。
- **单次运行的内部 RSD 只是健康信号。** 配对设计的精度已经体现在区间里，所以单轮偏噪不否决结论；只有过半运行 RSD > 5% 才判 `inconclusive-unstable-run`，意思是这台机器当时不可测量，应当换时间重跑。
- **`--cooldown-sec` 让机器降温。** 连续满负荷跑分会把机器烤到降频，实测同一基线可从 197 掉到 73 fps。每次运行前静置一段时间能显著压低跨轮离散度。
- **`order effect` 行是漂移探针。** 报告会分别给出 AB 轮与 BA 轮的平均 delta；两者差得越大（gap 越高）说明漂移越重、结果越不可信。稳态下这个 gap 应该只有几个百分点。
- 报告会校验两侧的谱面 hash、画布参数、渲染设置与浏览器/GPU 完全一致，否则直接报错；开跑前还会先确认两侧都带 `__chartBench`（忘记用 `VITE_CHART_BENCH=1` 构建是最常见的失误）。

## 像素回归

```sh
# 基线（改动前的 checkout）
yarn chart:visual --root /tmp/bench-baseline --out .bench/shots-before

# 改动后与基线比对，超预算则退出码非 0
yarn chart:visual --out .bench/shots-after --compare .bench/shots-before
```

渲染优化几乎都在改"画到哪些像素"，所以性能收益必须配一份画面证据。脚本在应用内全屏（dpr 2，约 1581² backing）下把压测谱面 seek 到 13 个固定时刻，每个时刻**连拍两次并要求逐像素完全一致**（先证明捕获本身确定性，否则差异无从归因），再与基线目录比对，按每像素最大通道差统计：

- `max`：全帧最大通道差，默认预算 64/255
- `>8`：最大通道差超过 8/255 的像素数，默认预算 32
- `changed%` / `MAE`：变化面积与平均通道误差，用来区分"整体轻微重采样"和"局部结构性改变"

`--strict` 把三条预算全部压到 0，即**要求逐像素完全一致**；证明"这次改动不改变任何像素"时用它。

覆盖面不能只有一种配置：`--dpr`、`--no-fullscreen`、`--settings '{"highlightExNotes":true}'` 可以换 backing 尺寸与渲染设置。**EX 高亮尤其重要**——tap 裁剪对 EX 走的是另一条分支，而应用默认设置里 `highlightExNotes` 是关的，只跑默认配置会整条漏掉。

每次运行还会调用 `__chartBench.validateSpriteCrops()` 做**精灵裁剪自检**：把手工推导的裁剪矩形和烘焙精灵的真实 alpha 包围盒对上，覆盖本次渲染过的全部 tap 变体。截图只能证明这 13 个时刻没切边，自检能证明所有已烘焙变体都没切边。

判据是**没有成片单向变暗/变亮**：精灵裁剪之类的改动会让大面积像素出现 ±1~2/255 的重采样抖动（面积可达数个百分点但 MAE < 0.05），这是可接受的；一旦出现上千个单向变暗的像素，就说明裁掉了真实墨迹而不是透明边缘。

## 分阶段含义

`MainRenderer.renderFrame` 里按执行顺序打点（见 `RENDER_PROFILE_STAGES`）：

`prepare`（timeline 换算）→ `clear`（背景 / 视频）→ `judgeLine` → `fireworks` → `hud`（BPM / 计数文字）→ `tracks`（滑条轨迹层）→ `slideStars`（滑条星头）→ `approach`（接近弧 + 多押连接）→ `heads`（tap / hold / 星星头）→ `touches`（touch 花瓣 / 边框）→ `effects`（波纹、命中特效）→ `total`

**只统计 CPU 时间**（JS + Canvas 命令录制）。GPU 光栅化是异步批量提交的，无法按阶段归因；`ctx.filter`、`shadowBlur`、`clip()` 的真实代价只体现在 FPS 或 `--sync-gpu` 的 `gpuSync` 里。

## 无头基准用法

```sh
# 首次：下载 Chromium（~150MB，到 ~/Library/Caches/ms-playwright）。playwright-core 已在 devDependencies。
yarn playwright-core install chromium

# 标准跑分（等价于 node scripts/chart-bench.mjs --stress --prod）
yarn chart:bench --out .bench/score.json

# 改动前：存基线
node scripts/chart-bench.mjs --chart 11663 --start 30000 --end 60000 --out .bench/before.json

# 改动后：对照
node scripts/chart-bench.mjs --chart 11663 --start 30000 --end 60000 --out .bench/after.json --compare .bench/before.json
```

**判断"用户会不会掉帧"必须加 `--prod`**（`vike build` + `vike preview`，约 40s）。dev 模式下 React 给每个组件发 `performance.measure`、Sentry Replay 录 DOM，两者合计占 dev 长任务采样的 50% 以上，掉帧的绝对值不可信；`--prod` 会设 `VITE_CHART_BENCH=1` 把基准工具编进生产包（普通 `yarn build` 不含）。

参数：`--stress`（固定压测谱面）、`--chart <id>`（线上真实谱面）、`--prod`、`--difficulty`（0-based，同 URL 参数）、`--fps`（步进，默认 120）、`--size` / `--dpr`（默认 1440 / 1.3）、`--sync-gpu`、`--no-gpu`、`--port`、`--trace <file>`（导出 Chrome trace，含 GPU / GC / 光栅任务，拖进 `chrome://tracing` 或 DevTools Performance 面板看）、`--playwright <dir>`（用另一份 playwright-core）。`.bench/` 已 gitignore。

同一台机器、同一段谱面、同一组参数才可比。**看 p50 / p95，不看 avg**：实测两次同参数运行 p50 完全一致、p95 差 ±10%，而 avg 差了 3 倍——一次 GC 或 GPU 刷新造成的 200ms 级停顿就能把 1800 帧的均值拉高数倍。停顿单独计在 `stalls`（total > 8ms 的帧数）里，`heaviest frames` 列出它们发生在谱面哪个时刻。小于 ±10% 的 p95 差异不算改善。

## 怎么归因一次掉帧

`--playback` 报告里每个掉帧行有三个数：rAF 间隔、该帧 CPU 耗时、间隔内的 store 写入。

- **CPU 耗时 ≈ 间隔** → 渲染器 JS 太慢，看 `topStage`，用离屏基准对照优化。
- **CPU 耗时 ≪ 间隔、无 store 写入** → 主线程被别的东西占了（GC、React 重渲染、其它定时器）或 GPU 反压；加 `--trace` 看长任务归因。
- **CPU 耗时 ≪ 间隔、有 store 写入** → 一次 zustand 更新触发了控件树重渲染；写入的键直接指出源头。

## 已知坑

- **默认必须真 GPU。** 脚本用 `channel: "chromium"` + `--use-angle=metal`。headless_shell / SwiftShader 软件光栅会在命令缓冲刷新时阻塞几百 ms 到几 s，并被算到恰好触发刷新的那个阶段上，`max` / `p99` 完全失真（首次冒烟里 `fireworks max 2145ms` 就是这样来的）。`env:` 行会打印实际 renderer，看到 `SwiftShader` 就别信数字。
- **`performance.now()` 精度。** 非 cross-origin isolated 页面精度只有 100µs，单帧阶段耗时大多量化成 0。脚本会给 dev 和生产预览都加 COOP/COEP 头并在运行前强制校验；手动在普通页面里跑 `__chartBench.run()` 时没有这层，数字会粗一档。
- **`--sync-gpu` 的 `gpuSync` 绝对值没意义**，里面大半是刷新 + 读回的固定开销；只在同尺寸下做相对比较。
- 不可用 `yarn dev --port`：vike 会拦截 Vite CLI 参数报 Unknown option。脚本走 Vite JS API 起 server。
- **`vike/api` 的 `preview()` 只认调用方自己的项目根**，无法在一个进程里服务另一个 checkout（会抛 vike bug 断言）。配对脚本因此直接用 Vite 的 `preview()` + `configFile: false` + `appType: "mpa"` 提供各自的 `dist/client`。
- **`ctx.filter = blur(N)` 的实际扩散半径不是按 σ=N/2 推的 1.5×N。** Chromium 实测描边外沿到 alpha 归零处为 2.43×N（六边形）/ 2.27×N（星形），烘焙精灵按 2.5×N 留边。取 1.5× 会把 halo 外圈直接切掉，逐像素对照会出现约 1000 个单向变暗的像素。
- **配对基线不需要完整 checkout。** 预览服务只读 `<root>/dist/client`，所以基线可以是一个只放了 `dist/` 的普通目录。另外共享 `node_modules` 软链的 worktree 里 `yarn vike build` 会因为 `.bin/vike` 缺失而失败，用 `node node_modules/vite/bin/vite.js build`（等价于 `yarn build` 的构建步骤）或直接在主 worktree 里构建后拷 `dist`。
- **大 trace 不能整文件 `JSON.parse`。** 20s 播放的 trace 可超过 500MB，触发 V8 单字符串上限 `ERR_STRING_TOO_LONG`。`scripts/lib/traceEvents.mjs` 按顶层对象边界流式产出事件。

## 参考基线

### 机器可测量性（2026-09-04/05，M4，Chromium 151.0.7922.34，Metal）

| 现象                     | 实测                                   | 结论                                     |
| ------------------------ | -------------------------------------- | ---------------------------------------- |
| 同代码跨会话             | 127 / 161 / 181 / 213 / 257 stress fps | 跨会话分数不可比，禁止跨会话 `--compare` |
| 同会话连续跑分（热降频） | 同一基线 137 → 115 → 96 → 88 fps       | 必须热身到稳态，且只在配对内比较         |
| 未达稳态时的顺序偏置     | 同一改动 AB 轮 `+7.2%`、BA 轮 `+34.1%` | 必须 AB/BA 交错并检查两序一致            |
| 单会话内部五轮 RSD       | 稳态下 0.1%–1.5%，热漂移期可达 20%–34% | 内部 RSD 只作健康信号，过半超标才弃用    |

### 本轮改动的判定结果

命中特效 stamp 与 tap 精灵按实测墨迹收紧合成范围（`NoteRenderer`）：

| 对照                       | 结果                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **vs `main`**              | **+11.3%**，95% CI `[+4.4%, +18.7%]`，verdict `improvement`（4 轮，AB/BA 两序全为正）                     |
| vs 父提交 `2599d2d`        | 稳态两轮 `+5.7%` / `+6.4%`（两序各一，四次运行 RSD 均 < 0.5%）；整轮被一次热崩塌污染，判定 `inconclusive` |
| `main` vs 父提交 `2599d2d` | `+0.9%`，CI `[-3.2%, +5.2%]`——早期烘焙提交相对 main 无可测差异                                            |
| 像素回归                   | 通过：13 帧最大通道差 43/255，超 8/255 的像素每帧 ≤ 9，MAE ≤ 0.04/255                                     |
| 处置                       | **保留**                                                                                                  |

> **不要引用早期那个 +42%。** 那次配对的两侧都带着后来被撤销的 touch 紧尺寸精灵，测的是"在 touch 填充已经减半的前提下再砍 note 填充"。touch 改动撤销后 touch overdraw 重新主导瓶颈，同一处 note 收紧只剩 +6%~+11%——这是 Amdahl 效应，不是测量漂移。**任何百分比都只在它被测出来的那套配置下成立**，配置一变就必须重测。

精灵源从 canvas 换成 `ImageBitmap`（`NoteRenderer` / `TouchRenderer` / `TouchHitEffectRenderer`）：

| 项目     | 结果                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| 像素回归 | **逐像素完全一致**：6 种配置 × 13 帧 = 78 帧，maxDelta 全为 0                                              |
| 配对性能 | **无可测收益**：`-5.6% / +0.7% / +0.1% / -0.8%`，几何均值 `-1.4%`，CI `[-5.9%, +3.2%]`，AB/BA gap 仅 2.7pp |
| 处置     | **撤销**，patch 存 `.bench/imagebitmap-sprite-sources.patch`                                               |

> 这条值得记一笔：**第一次不带 `--cooldown-sec` 的配对测出 `+67% / +68% / +2% / +73%`，看起来是巨大胜利**。但当时 7/8 次运行内部 RSD 超标、基线在 72–171 fps 之间乱跳，工具判了 `inconclusive-unstable-run`。加上冷却重测后收敛到 0 附近。**热噪声能凭空造出一个 +68% 的"优化"**——这正是不能拿单次跑分下结论的原因。

touch 花瓣改紧尺寸分层精灵（`TouchRenderer`，224² → 160²，面积 0.51）：

| 项目     | 结果                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配对性能 | **未通过**。第一次 3 轮：`+7.2% / +34.1% / +35.7%`，CI `[-10.2%, +73.7%]`；热稳态后重测 4 轮：`+73.2% / +134.5% / -4.6% / +35.6%`，CI `[-17.4%, +177.5%]`，4/8 运行内部 RSD 超标 |
| 像素回归 | 通过：最大通道差 49/255，差异稀疏且双向，无裁切带                                                                                                                                |
| 处置     | **撤销**。像素安全但收益未被证明；两次尝试都落在机器不可测量的时段，需在稳定机器上重测后再提                                                                                     |

不要用"两个隔离结果相除"去推第三个改动的贡献：这些比值来自不同会话，而同代码跨会话能差 2 倍，相除得到的是噪声。每个改动都要有自己的同会话配对运行。

### 真实谱面与播放（2026-09-02，M4，Chromium 1234）

系ぎて [DX] Re:MASTER（1366 notes）30s–60s @120fps，3600 帧：

```
stage          p50    p95    p99    max
tracks       0.000  0.085  0.255 13.810
heads        0.005  0.025  0.095  5.910
effects      0.005  0.030  0.070  1.085
total        0.035  0.175  0.445 14.180
```

CPU 侧 p95 仅 0.18ms/帧，离 144Hz 的 6.9ms 预算很远；最重的帧全在 `tracks`（滑条轨迹层重建）和 `heads`。这张谱面上渲染器 JS 不是瓶颈。

### 真实播放：dev 与 prod 的差别就是全部答案

同一段谱面（0–20s，含起播），全屏 dpr 2 ≈ 2.5MP backing，无头 Chromium 120Hz：

|                                | dev server                        | **生产构建**                                                         |
| ------------------------------ | --------------------------------- | -------------------------------------------------------------------- |
| rAF 间隔 p50 / p95 / p99 / max | 8.33 / 10.1 / 10.3 / **66–183ms** | 8.30 / 9.20 / 9.30 / **9.4ms**                                       |
| 掉帧（> 1.5 帧）               | 2–4 帧 / 2400                     | **0**                                                                |
| 主线程长任务 > 8ms（播放中）   | 6–8 个，最长 95ms                 | 3 个，最长 28ms（起播瞬间）                                          |
| 渲染器 CPU p95                 | 0.69ms                            | 0.30ms                                                               |
| 主线程忙碌占比                 | —                                 | 8–9%；其中 79% 是 V8 `(program)`、8% canvas 渲染器、6% Sentry、1% GC |
| 合成器 / GPU 进程忙碌          | —                                 | 1.7% / 3.7%                                                          |

**生产构建下这张谱面 20 秒内一帧都没掉。** dev 里 60–95ms 的长任务在 prod 里不存在：trace 采样归因显示 dev 长任务的 40% 是 React DEV 构建的 `performance.measure`（每个组件一条）、13% 是 Sentry Replay 的 DOM 录制、只有 5% 是 `ChartDensityTimeline` 自身。React 重渲染是**放大器**而不是根因——它在 dev 里被放大了 5–10 倍。

为了确认这一点，对 `ChartDensityTimeline` 做了 `memo` + 元素树缓存、`Controls` / `PlaybackControls` 改成按键订阅（不再 `useShallow(state => state)`），然后 prod 下前后对照：**两者都是 0 掉帧、interval 分布完全相同**。这两处改动保留了（是正确的写法，dev 体验也更好），但它们对生产帧率没有可测影响。

排除清单（生产构建，trace 实测）：

- **GPU**：主线程等 GPU 0 次；GPU 进程 `CommandBuffer::Flush` p50 0.17ms / p95 0.34ms；合成器线程忙 1.7%。全帧 `clip()`、`filter`、2.5MP backing 在 Metal 上都不构成压力。
- **GC**：20s 内 MinorGC 4 次（最长 1.6ms）、MajorGC 9 次（最长 2.6ms），都远在 8.3ms 帧预算内。
- **渲染器 JS**：p95 0.3ms/帧，占主线程忙碌的 8%。
- **React**：播放稳态没有 store 写入，因此没有重渲染；起播 / 结束各一次，属预期。

因此在本机（M4 / Chromium / Metal）上，**当前实现没有可复现的性能瓶颈**。用户截图里 FPS 从 120 掉到 ~60 的深坑，最可能的解释按顺序：

1. **跑的是 `yarn dev`**——dev 构建的 React 打点 + Sentry Replay 恰好能制造这种形态的偶发深坑；
2. 真机上其它进程 / 浏览器扩展 / 后台标签页的干扰；
3. 不同 GPU（Intel 集显、Windows ANGLE D3D11）上 filter / 大 backing 的代价与 Metal 不同——这需要在目标机器上用 `--prod --playback --trace` 复测，脚本支持在任何装了 Chromium 的机器上跑。

**接下来任何"性能优化"在合并前都应先用 `--prod --playback` 证明它改变了掉帧数或 interval p99；否则只是重排代码。** 前面列过的 canvas 侧候选项（星星头精灵、波纹环精灵、clip 改盖角、分配清理）在本机数据下全部没有可测收益，暂不实施。
