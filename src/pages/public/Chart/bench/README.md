# 谱面渲染性能量化

## 标准跑分

```sh
# 生产构建、固定压测谱面、固定设置、三轮取中位数
yarn chart:bench --out .bench/current.json

# 修改前后对照
yarn chart:bench --out .bench/after.json --compare .bench/before.json
```

标准跑分不下载线上谱面或音乐。它使用版本化的 `LXNS Renderer Stress` 合成谱面：240 BPM、20 个有效小节、5440 个渲染 Note，覆盖 tap / break / EX / hold / touch / touch hold、烟花、旋转星星和全部 13 种 slide path；密度高于正常谱面。固定参数为 1440 逻辑像素、DPR 1.3、120 个谱面采样点/秒、全部视觉效果开启。

分数单位是 **stress frames/s，越高越好**。每轮把整张压测谱面尽快连续渲染，每帧向一个独立的栅栏 Canvas 像素写入当前画面，并在轮末读回栅栏，确保中途画面不会因下一帧 clear 被浏览器丢弃，也确保 Canvas 命令和 GPU 光栅化全部完成；`1000 / 全轮平均 ms/frame` 是该轮分数，最终成绩取三轮中位数。正式跑分关闭逐阶段 profiler，之后另跑一轮生成 CPU 阶段诊断，因此打点开销不会进入主分数。

结果会记录压测谱面版本和内容 hash，不同 hash、画布或采样设置会拒绝对比。`spread` 是三轮最高与最低分之差占中位数的比例；超过 5% 时本轮噪声过大，应重跑后再判断小幅优化。

## 工具层级

从"看一眼"到"可复现对照"：

| 层           | 入口                                                                                                            | 用途                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实时面板     | `yarn dev` → `/chart` 右上角 DEV 角标 → 展开 → **Frame Profile (CPU)**                                          | 播放中看各阶段 avg/max（250ms 窗口），定位当前瓶颈                                                                                                                         |
| 标准跑分     | `yarn chart:bench`                                                                                              | 生产构建 + 固定压测谱面，输出可长期对照的单一成绩、三轮波动和阶段诊断                                                                                                      |
| 页面内基准   | DevTools console：`await __chartBench.run({...})`                                                               | 不依赖播放/音频/rAF，按固定步进渲染一段谱面，输出各阶段 p50/p95/p99/max + 最重帧列表                                                                                       |
| 无头基准     | `node scripts/chart-bench.mjs --chart <id> ...`                                                                 | 从 shell 一条命令跑完，可 `--out` 存 JSON、`--compare` 对照，供 agent 做改动前后验证                                                                                       |
| 真实播放剖析 | `node scripts/chart-bench.mjs --chart <id> --playback --fullscreen` 或 console `__chartBench.profilePlayback()` | 真的走 rAF + 音频时钟 + 合成，逐帧记录 rAF 间隔与 CPU 耗时，报告掉帧率、掉帧时刻、该帧 CPU 占比、以及那一帧间隔内发生的 store 写入。回答"掉帧是 JS、GPU 还是 React 重渲染" |
| Chrome trace | 上面任一模式加 `--trace .bench/x.json`                                                                          | 导出含 GPU / GC / JS 采样栈的 trace；脚本直接打印主线程长任务（> 8ms）及每个长任务里占比最高的应用代码帧。拖进 DevTools Performance 面板可看火焰图                         |

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
- **`performance.now()` 精度。** 非 cross-origin isolated 页面精度只有 100µs，单帧阶段耗时大多量化成 0。脚本给 dev server 加了 COOP/COEP 头；手动在浏览器里跑 `__chartBench.run()` 时没有这层，数字会粗一档。
- **`--sync-gpu` 的 `gpuSync` 绝对值没意义**，里面大半是刷新 + 读回的固定开销；只在同尺寸下做相对比较。
- 不可用 `yarn dev --port`：vike 会拦截 Vite CLI 参数报 Unknown option。脚本走 Vite JS API 起 server。

## 基线（2026-09-02，M4，Chromium 1234，1440px × 1.3 dpr）

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
