---
name: code-comments
description: 用于在本仓库编写、审查（review）或重构代码注释时。当需要判定注释的保留与删除边界、规范 JSDoc 外部黑盒契约（@throws/副作用/前置假设/所有权）、保护实测物理拟合常量与平台兼容 Hack、清理无信息量套话与语法复述，或验证纯注释变更（代码逻辑零变更）时触发。
---

# 代码注释规范 (Code Comments Skill)

本规范为本仓库中编写、审查（Review）与重构代码注释提供机械化、可执行的判定基准与验证流程。

---

## 一、核心准则与判定标准

### 1. 净信息量三原则

1. **黑盒契约优先**：外部 JSDoc 服务于调用方，必须补足函数签名无法表达的信息（`@throws` 抛错条件、状态/Canvas 副作用、前置时空假设、跨模块所有权边界）。
2. **内部实现克制**：函数内部实现优先通过命名与结构自解释；仅保留关键工程上下文（实测拟合、平台 Hack、帧预算）与不可消除复杂算法的「Why」。
3. **零容忍噪声**：杜绝语法复述、机械直译类型、构造函数模板套话。

### 2. 判定决策流程

```
[待检查注释]
      │
      ▼
它是否仅仅在复述代码语法、操作或类型？（如：`// 循环遍历数组`、`@param x X坐标`）
      ├─ 是 ──► 【必须删除】（纯语法复述 / 无信息量包装）
      └─ 否
            │
            ▼
它位于函数外部（JSDoc）还是函数内部？
      ├─ 外部（JSDoc）
      │     │
      │     ▼
      │   它是否阐明了签名无法表达的契约？（抛错、副作用、所有权、前置隐式假设）
      │         ├─ 是 ──► 【必须保留 / 补充】（高质量外部契约）
      │         └─ 否 ──► 【删除或精简】（若仅翻译参数类型和名字则删除）
      │
      └─ 内部（行内注释 / 常量定义）
            │
            ▼
          它是否解释了关键工程上下文？
          (实测物理拟合、平台/浏览器 Hack、硬件/帧预算、缓存失效、单位脱节、格式语法记号)
                ├─ 是 ──► 【必须绝对保留】
                └─ 否
                      │
                      ▼
                    该处逻辑是否极其复杂且无法通过提取函数/变量名自解释？
                          ├─ 是 ──► 【视情况保留】（仅聚焦 Why，不写 What）
                          └─ 否 ──► 【必须删除】（重构优先消除注释）
```

### 3. 关键区分：常量的实测依据 vs 改动理由与性能战报

这是审查与清理中最容易混淆的边界，必须用以下判据收紧：

- **常量的实测取值依据【必须保留】**：说明当前代码中的数值或行为**为何是这个值**（例如：`0.735 R/s` 来自 138 帧录像拟合，`σ ≤ 0.0024R`；Chromium 高斯模糊实际扩散边界为 `2.43×N` 而非理论 `1.5×N`）。
  - **唯一黄金判据**：“**删掉之后，这个数字还能不能被复核和安全修改？**”——若后续维护者失去该依据将无法复核数值来源或不敢修改，必须保留。
- **改动理由 / 性能战报【必须删除】**：讲述某次修改带来的好处、历史背景或优化心得（例如：“改成 X 后快了 30%”、“之前是 Y”、“这是推荐的优化做法”、“用局部变量缓存以避免每次查找属性”）。
  - 此类内容属于 Git Commit Message，严禁作为代码注释留在源码中。

---

## 二、分层执行清单

### 1. 第一层：必须保留或补充 (Mandatory)

编码了类型签名与代码实现无法表达的隐式契约或关键工程上下文：

- **抛错条件 (`@throws`)**：函数在何种参数组合、边界条件或外部状态异常时抛错。必须用 `@throws {ErrorType} 触发条件` 清晰列出。
- **隐式副作用与状态边界 (Side Effects)**：Canvas 状态栈（如使用 `"lighter"` 混合模式是否自行 `save/restore`）、全局时钟平移（如谱面解析自动插入 1 小节/4 拍前奏偏移）、入参就地修改。
- **调用禁忌与前置假设 (Invariants)**：TypeScript 类型系统无法表达的约束（如入参数组必须按 `timingMs` 升序排列；时间戳已扣除输出延迟处于过去，严禁传入 `source.start()`）。
- **跨模块所有权与时钟边界 (Ownership)**：明确标明模块不持有的状态归属及架构原语地位（如 `AudioManager` 仅调度正解音，不持有音乐播放与 React 状态，播放与输出时钟由 `usePreviewAudio` 独占；`TimingTimeline` 为 beat/ms 转换唯一权威原语，`O(log n)` 复杂度，禁业务层自行开码扫描）。
- **常量的实测取值依据 (Empirical Constants)**：录像采样、逐帧拟合样本量、标准差、通道回归权重等魔法数字取值依据（必须符合“删后无法复核与安全修改”判据）。
- **硬件限制与帧预算权衡 (Frame Budget)**：为迎合硬件显示刷新率、vsync 预算或防 GPU 超限的架构截断（如 144Hz 下 vsync 预算仅 6.9ms，DPR=3 合成超预算掉帧，因而强制截断 `MAX_DPR = 2` 节省 ~56% 像素）。
- **平台与环境兼容 Hack (Platform Quirks)**：规避特定平台或浏览器内核缺陷的非常规写法（如移动端 Safari 在 `alpha: false` 下用 `clearRect` 会导致导出图像透明，必须用 `fillRect`；Canvas 显式 `{ alpha: false }` 走 RGB 快速路径）。
- **缓存失效条件与依赖元组 (Cache Invalidation)**：缓存以什么为键、何种外部状态（如判定圈半径、镜像模式）变更时自增版本或整体失效。
- **命名与暂存物理单位脱节警告 (Type/Unit Dissonance)**：多阶段处理流水线中变量名与当前阶段实际承载物理量不一致（如字段名为 `delayMs`，但当前暂存的是节拍数 `beat`，后续统一步骤才换算为毫秒）。
- **领域语法记号与魔法枚举语义 (Domain Tokens)**：文本解析中特定分隔符、首字符判定或枚举数值代表的业务规则。

### 2. 第二层：视情况保留 (Situational)

函数体内部针对局部具体实现的注释：

- **复杂算法与循环不变量**：二分查找的区间边界维护（如 `[lo, hi)` 左闭右开、偏右中点防死循环）、Canvas 路径镂空非零环绕规则。
- **非显然的状态转移**：状态机在边界条件下的特殊容错跳转。
- **执行准则**：**重构优先**（能通过提炼变量名/函数名自解释的，绝不写注释）；无法自解释时**仅写 Why**，绝不写 What。

### 3. 第三层：必须删除 (Strictly Prohibited)

- **语法复述型注释**：直接复述随后的代码语句（如 `// 遍历 notes`、`// 检查 note 是否存在`、`// 返回计算结果`）。
- **机械直译参数的 JSDoc**：仅把类型和名字直译为中文（如 `@param x X坐标`、`@param color 颜色`、`@returns 返回布尔值`）。若参数自明且无隐式边界约束，不写 `@param`。
- **构造函数模板化套话**：`/** 创建 X 类的实例。 @param config 配置选项 */`。构造函数除非有易忽略的外部副作用，否则不写 JSDoc。
- **单行简单私有辅助函数的冗余 JSDoc**：为一两行即可看懂的辅助函数强行堆叠完整 JSDoc。
- **改动理由与性能战报**：描述这次改动的优越性、历史对比或通用建议（如“改成 X 快了 30%”、“避免属性查找”）。

---

## 三、真实案例对比与退化剖析

### 1. 正面范例 (Good Patterns)

#### 案例 1：完备黑盒契约与副作用说明

文件：`packages/maimai-chart-engine/src/effects/TouchHitEffectRenderer.ts`

```typescript
/**
 * 渲染当前时间窗口内的 Touch 命中特效。
 *
 * 调用约束与行为：
 * - `touches` 必须按 `timingMs` 升序排列（内部依赖二分查找筛选时间窗口）。
 * - 仅渲染普通 Touch Note，自动忽略 `TouchHoldStartNote`。
 * - 判定特效窗口为 `[timingMs, timingMs + 500ms)`。
 * - 同一传感器位置若有多个重叠特效，仅保留最新触发的特效。
 * - 绘制副作用：使用 "lighter" 混合模式绘制到当前 Canvas 上下文，函数内部会自行保存与恢复绘制状态。
 */
export function renderTouchHitEffects(...)
```

> **解析**：说明了排序前置约束（类型无法表达）、黑盒过滤行为（无需调用方预滤）、时间窗口去重及 Canvas 状态自恢复副作用。

#### 案例 2：显式调用禁忌与保守估计依据

文件：`packages/maimai-chart-engine/src/core/audio/audioClock.ts`

```typescript
/**
 * 返回当前估算已到达物理输出端（即听众正在听到）的 AudioContext 时刻（秒）。
 *
 * 【调用约束】仅供视觉时钟与音画同步使用。由于该时刻已扣除输出延迟（处于过去），
 * 严禁传入 source.start() 等音频调度方法。
 */
export function getAudioContextOutputTime(audioContext: AudioContext): number {
  ...
  // 时间戳与延迟估算并存时取较小值（保守估计），防止时间戳抖动导致画面超前于实际听感
  const outputTime = timestampTime === null ? latencyAdjustedTime : Math.min(timestampTime, latencyAdjustedTime);
}
```

> **解析**：划定调用红线（已扣延迟处于过去，禁用于未来调度）；行内注释精准聚焦 Why（为何取较小值）。

#### 案例 3：显式声明隐蔽时空偏移与 `@throws`

文件：`packages/maimai-chart-engine/src/core/parser/Ma2Parser.ts`

```typescript
/**
 * 解析文本谱面并转换为统一的 Chart 结构。
 *
 * 契约与副作用：
 * - 解析时会在谱面开头插入 1 小节（4 拍）的前奏偏移，所有音符及事件的时值均向后平移。
 *
 * @throws {Error} 当谱面文本中缺少 RESOLUTION 或 BPM_DEF 声明时抛出异常
 */
export function parseMa2Chart(ma2Text: string, difficulty: ChartDifficulty): Chart;
```

> **解析**：揭示全局时间轴向后平移 1 小节的隐蔽副作用；明确标注异常触发条件。

---

### 2. 退化案例审计 (Anti-Degradations)

#### 案例 4 [退化]：抹杀移动端浏览器缺陷与兼容 Hack

文件：`packages/maimai-chart-engine/src/renderers/MainRenderer.ts`

- ❌ **错误改动**：概括为「采用不透明填充以确保导出图像背景不透明」或直接删除。
- ✅ **正确保留**：
  ```typescript
  // fillRect 保证导出的背景不透明。
  // clearRect 依赖 alpha:false，移动端 Safari 不可靠，会导致导出图透明。
  this.ctx.fillRect(0, 0, s, s);
  ```
  > **解析**：删除 Safari 缺陷说明后，维护者极易误判为“改用 `clearRect` 性能更好”而重构，重新引发移动端导出图透明缺陷。

#### 案例 5 [退化]：误删暂存物理单位冲突的防坑警告

文件：`packages/maimai-chart-engine/src/core/parser/Ma2Parser.ts`

- ❌ **错误改动**：视作代码复述直接删除。
- ✅ **正确保留**：
  ```typescript
  parentSlide.delayMs = delay; // 阶段暂存：此时单位为节拍数（beat），后续统一步骤才换算为毫秒
  parentSlide.allDelayMs.push(delay);
  ```
  > **解析**：字段名以 `Ms` 结尾但当前阶段实际存的是拍数。删除注释会导致阅读者被变量名严重误导。

#### 案例 6 [退化]：抹杀 144Hz 硬件帧预算与性能推导数据

文件：`packages/maimai-chart-engine/src/renderers/MainRenderer.ts`

- ❌ **错误改动**：将行内推导整段全删，使 `MAX_DPR = 2` 沦为无法理解的魔法常数。
- ✅ **正确保留**：
  ```typescript
  // 144Hz 显示器的 vsync 预算只有 6.9ms，按完整 DPR=2/3 渲染时浏览器
  // composite canvas backing store 的成本会顶满预算导致掉帧；不过手机屏幕通常
  // 物理面积小，按 DPR=2 渲染仍可接受，上限 2 在 DPR=3 设备节省 ~56% 像素。
  const rawDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  ```

#### 案例 7 [退化]：将实测扩散参数降级为抽象套话

文件：`packages/maimai-chart-engine/src/renderers/NoteRenderer.ts`

- ❌ **错误改动**：缩写为「高斯模糊实际扩散半径与模糊参数的比值，防止边缘外层光晕被截断」。
- ✅ **正确保留**：
  ```typescript
  /**
   * TAIL 是 `ctx.filter = blur(N)` 实际扩散到的半径与 N 的比值，实测值：Chromium 下
   * 描边外沿与 alpha 归零处为 2.43×N（六边形）与 2.27×N（星），不是按 3σ=N/2 推的 1.5×。
   * 取小了会把 halo 外圈直接切掉——1.5× 时逐像素对照有上 1000 个像素单向变暗。
   */
  const SPRITE_BLUR_TAIL_RATIO = 2.5;
  ```
  > **解析**：记录了与理论值（1.5×）的实测偏离及逐像素对照后果，防止被后续维护误当成理论值而改小。

#### 案例 8 [退化]：将实测拟合依据与呼吸感机理抹平

文件：`packages/maimai-chart-engine/src/effects/HoldEffectRenderer.ts`

- ❌ **错误改动**：抹平成「每个周期内按偏移发射 3 颗后留空，扩散由出生半径线性外扩」。
- ✅ **正确保留**：
  ```typescript
  /**
   * 实测（2.3s / 138 帧录像，23 颗波纹平均，σ ≤ 0.0024R，单位为判定圈半径 R）：
   * - 发射不是匀速：每个 HOLD_ACTIVE_CYCLE_MS 循环内连发 3 颗（间隔 4 帧），然后空 8 帧。
   *   同屏颗数因此在 1~3 之间起伏；匀速发射会稳定在 2~3 颗，看起来就没有呼吸感。
   * - 环峰 0.1355R 出生，线性外扩 0.735 R/s，11 帧后在 0.2583R 消失
   * - alpha 峰值 1（按 R 通道对 age 2~10 线性拟合，斜率 -0.101/帧、age 11 归零），最初一帧维持峰值
   * - 单颗是细环而非实心圆，且环宽按半径等比缩放（FWHM/峰半径在 0.173R 与 0.223R 处同为 0.165）
   */
  const RIPPLE_BIRTH_RADIUS_RATIO = 0.1355;
  const RIPPLE_GROWTH_RATIO_PER_SEC = 0.735;
  ```
  > **解析**：常量的取值依据（样本量、标准差、斜率）与被否决的替代实现（匀速发射无呼吸感）必须保留。删掉后常量失去复核基础。

#### 案例 9 [退化]：抹杀架构原语地位与跨模块所有权指针

文件：`packages/maimai-chart-engine/src/core/timing/TimingTimeline.ts` 与 `packages/maimai-chart-engine/src/core/audio/AudioManager.ts`

- ❌ **错误改动**：删去 `O(log n)` 复杂度契约及禁止自行开码的禁令；将指向 `usePreviewAudio` 的所有权模糊化为泛指的“外部时钟”。
- ✅ **正确保留**：
  - `TimingTimeline`：注明其为 beat 与 ms 互转的**权威原语**，构造时积分 BPM，之后为 `O(log n)` 二分查询，应用层与渲染热路径必须复用、严禁各自开码扫描。
  - `AudioManager`：注明仅负责 answer 音频调度，**不持有**音乐播放与 React 生命周期，播放与输出时钟由 `usePreviewAudio` 独占。

---

### 3. 无信息量反例 (Anti-Patterns)

#### 案例 10 [反例]：构造函数模板化套话

文件：`packages/maimai-chart-engine/src/core/audio/AudioManager.ts`

- ❌ **错误代码**：
  ```typescript
  /**
   * 创建打击音调度器实例。
   * @param config 调度器配置选项，包括关联的 AudioContext 与目标输出节点。
   */
  constructor(config: AudioManagerConfig)
  ```
- ✅ **正确做法**：直接删除整段 JSDoc。无易忽略外部副作用的构造函数无需注释。

#### 案例 11 [反例]：私有简单单行函数过度文档化

文件：`packages/maimai-chart-engine/src/core/audio/audioClock.ts`

- ❌ **错误代码**：
  ```typescript
  /** 校验延迟数值是否合法。仅在数值为大于 0 的有限数时返回原值，否则返回 null。 */
  function getFinitePositiveLatency(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
  }
  ```
- ✅ **正确做法**：直接删除 JSDoc，依靠自解释命名。

---

## 四、语言与表述规范

1. **客观中性，杜绝敏感词**：严禁出现任何特定商业游戏名称、反编译/逆向工具名称或未公开数据来源。一律使用“实测采样”、“录像测量”、“真机录像回归”、“协议规范”等中性技术词汇。
2. **量纲必须明确**：物理量必须注明单位（毫秒 `ms`、秒 `s`、节拍 `beat`、像素 `px`、弧度 `rad`）。
3. **文字简练直接**：使用规范技术书面语，杜绝口水话、感叹句与宣传性口号。
4. **注释术语必须与代码标识符对齐（严禁单方面中英互译）**：
   - **核心规则**：**注释中的领域名词必须与代码标识符使用同一套词**，不做中英互译。标识符是 `hold-start` / `HoldStartNote` / `touch-hold-start`，注释就写 `Hold` / `Touch Hold`，绝不要写成「长按」「触摸长按」。
   - **判据**：**读者能否把注释里的名词直接对上代码里的标识符？** 若需要脑内二次翻译，就是错的。
   - **同源退化剖析**：规范此前仅规定「保留/删除哪些信息」，未约束「用什么词」，导致整理中出现系统性术语漂移。这与「将实测参数降级为抽象套话」（案例 7）同属一类退化：形式上看似统一为纯中文更“整齐”，实则切断了注释与代码标识符的直连映射，人为增加读者的脑内翻译成本。
     - _典型退化反例_：`types/index.ts` 原本有 8 处用英文 `Hold` 指音符类型（如 `/** 是否为 Hold 开始 */`、`/** 是否为绝赞 Hold */`），整理后沦为 0 处 `Hold`、22 处「长按」，与代码中的 `hold-start` / `HoldStartNote` 割裂；`HoldRenderer.ts` 甚至在同一句中自相矛盾：「负责长按音符（含普通 Hold 与 EX Hold）…」。
   - **禁止单方面改动既有术语**：术语属于全仓库一致性问题，不属于「优化注释」的授权范围。确有必要统一时应当作为独立任务全仓覆盖推进，严禁在逐文件清理注释时顺手改动。
   - **例外情形**：
     1. _物理操作动作_：真正描述交互操作（如“按住”屏幕）而非音符类型名时，用中文自然表述；
     2. _既有中文惯例_：若本仓库注释一贯使用某个中文术语，沿用既有惯例，不要单方面改成英文。判断依据是 `git show HEAD:<file>` 里的原有写法。
   - **核查误报陷阱**：用关键词计数排查术语漂移时警惕分词误报。例如「以拍数为单位的时**长按**指定 BPM 换算」中是「时长」+「按」，并非音符类型「长按」，替换前必须结合上下文人工甄别。

---

## 五、验证手段与审查清单

### 1. 真实可用的仓库验证命令

本仓库未配置单元测试运行器（无 `test` / `jest` / `vitest` 脚本），验证基于 `package.json` 中真实存在的命令：

```bash
# 静态类型检查与生产构建（验证未误损语法、括号、JSDoc 类型引用）
yarn build

# 代码规范检查（--max-warnings 0，任何告警直接失败）
yarn lint

# 格式校验与自动修复
yarn format:check
yarn format
```

### 2. 验证“仅改注释、代码逻辑零变更”的自动化手段

在终端执行以下 Node.js 脚本，比对工作区与 `HEAD` 剥离注释与空白后的纯代码：

```bash
node -e "
const fs = require('fs');
const { execSync } = require('child_process');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/\s+/g, '');

const files = execSync('git diff --name-only packages')
  .toString()
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

let failed = false;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const headRaw = execSync('git show HEAD:' + f, { maxBuffer: 10 * 1024 * 1024 }).toString();
  const workRaw = fs.readFileSync(f, 'utf8');

  if (strip(headRaw) !== strip(workRaw)) {
    console.error('❌ 代码逻辑变动检测失败（非纯注释变更）: ' + f);
    failed = true;
  } else {
    console.log('✅ 纯注释变动验证通过: ' + f);
  }
}
if (failed) process.exit(1);
"
```

退出码为 `0` 证明没有改动任何可执行语句、变量名、操作符或控制流。

### 3. 人工审查（Review）核对清单

- [ ] **防误删（关键工程上下文）**：实测拟合依据（录像采样/标准差/通道回归）、硬件帧预算（144Hz 6.9ms/MAX_DPR）、平台兼容 Hack（Safari 导出透明）、暂存单位脱节警告（`delayMs` 存拍数）、缓存失效依赖元组。
- [ ] **查收紧（区分依据与战报）**：常量的实测取值依据保留；改动历史、重构战报（快了 X%、优化建议）坚决删除。判据：删掉后该数字是否仍能被安全复核与修改？
- [ ] **查补充（外部黑盒契约）**：公有 API 的 `@throws` 条件、Canvas 混合模式/时钟平移副作用、前置排序约束（升序）、跨模块所有权指针。
- [ ] **查噪声（坚决清理）**：删除语法复述（`// 遍历列表`）、构造函数套话（`创建 X 实例`）、直译 JSDoc 标签、单行简单辅助函数多行注释。
- [ ] **术语对齐（严禁中英互译漂移）**：注释领域名词必须与代码标识符（如 `Hold` vs `hold-start`）直接对齐，禁止脑内翻译；禁止在注释整理中单方面改写既有术语（依据 `git show HEAD:<file>`）；区分操作动作与类型名，核查时排除上下文误报（如「时长按」）。
- [ ] **合规性**：零游戏名、零反编译工具名、零私有数据源，物理量纲明确。
