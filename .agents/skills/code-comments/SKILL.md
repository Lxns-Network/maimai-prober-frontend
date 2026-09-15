---
name: code-comments
description: 本仓库（src、tests、packages 全部代码）的注释编写、审查与重构规范。涵盖改写克制四原则、判定流程与保持原样闸门、核心实测案例与退化审计、篇幅文风、事实核对及纯注释变更自动化验证。
---

# 代码注释规范 (Code Comments)

本规范适用于本仓库的全部代码（`src/`、`tests/`、`packages/`），为注释的编写、审查与重构提供机械化判定基准。核心目标是**锁定关键工程事实、压低注释噪声、杜绝无效改写**。

下文案例多取自 `packages/maimai-chart-engine`（该包注释密度最高、踩坑记录最完整），但判定标准对全仓库一视同仁。

---

## 一、核心原则与改写克制

### 1. 净信息量四原则

1. **黑盒契约优先**：JSDoc 仅服务于外部调用方，必须补足类型签名无法表达的信息（`@throws` 抛错条件、Canvas 状态/时钟平移副作用、前置时空假设、跨模块所有权）。
2. **内部实现克制**：内部逻辑优先由命名与结构自解释；仅保留实测物理拟合、浏览器兼容 Hack、帧预算与不可消除算法复杂度的“Why”。
3. **零容忍噪声**：坚决清理语法复述、机械直译类型与构造函数模板套话。
4. **改写克制（核心防线）**：
   - 既有注释只要事实准确、信息不冗余，**一律保持原样，一个字都不改**。严禁为了“措辞更顺、风格统一、格式工整”推倒重写。
   - 先问“这条注释该不该存在”，再问“能不能写得更好”。改写本该删除的注释是双重浪费。
   - 一次注释整理的正确产出必然是**删除远多于新增**。若文件注释已合格，正确产出是零改动并明确汇报“无需改动”。

### 2. 整理跑偏失败信号（命中任一立即回退重来）

- **行数倒挂**：新增行数多于删除行数（实测对比：错误执行 +675/-557，正确执行 +585/-1442 净减 857 行）。
- **无谓润色**：给本就合格的注释重写句式或替换同义词。
- **形式主义膨胀**：堆砌分节小标题，或把代码一眼可见的 `if/else` 分支与阈值抄入注释。
- **越权改动**：整理注释时顺手改动逻辑代码、新建文件或提出无关架构建议。

---

## 二、判定流程与分层清单

### 1. 判定流程

```
[待检查注释]
      │
      ├─ 纯语法复述 / 无信息量包装？ ──────────────────────► 【必须删除】
      │
      ├─ 外部 JSDoc 是否阐明了签名外的契约？(抛错/副作用/假设) ─┐
      │  内部注释是否记录了关键工程上下文？(实测/Hack/帧预算) ──┤
      │  （复杂逻辑是否无法通过重构自解释？）                  │
      │        │                                                │
      │        ├─ 否 ───────────────────────────────────────────┴─► 【必须删除】
      │        └─ 是
      │              │
      │              ▼
      │        它是否已经事实准确、信息不冗余？
      │              ├─ 是 ────────────────────────────────────► 【保持原样】(一字不改)
      │              └─ 否 ────────────────────────────────────► 【补充缺失契约 / 修正错误】
```

### 2. 黄金判据：常量实测依据 vs 改动理由与战报

- **常量实测依据【必须保留】**：说明数值为何是这个值（如录像逐帧拟合样本量、标准差、浏览器扩散偏离）。
  - **唯一黄金判据**：“**删掉后，该数字还能否被复核与安全修改？**”——若无法复核则必须保留。
- **改动理由与战报【必须删除】**：讲述优化效果、历史演进或心得（如“改成 X 后快了 30%”、“避免属性查找”）。此类内容属于 Git Commit Message，源码中严禁收录。

### 3. 三层执行清单

- **第一层：必须保留或补充 (Mandatory)**
  - **抛错与副作用**：`@throws` 触发条件；Canvas 混合模式/状态栈污染；全局时钟平移（如谱面解析自动插入 1 小节/4 拍前奏偏移）。
  - **调用禁忌与前置假设**：如数组必须按 `timingMs` 升序；时间戳已扣除输出延迟属于过去，严禁传给 `source.start()`。
  - **架构原语与所有权**：如 `TimingTimeline` 为 beat/ms 互转唯一权威原语，`O(log n)` 二分，禁业务层自行开码扫描；`AudioManager` 仅调度正解音，不持有播放与 React 状态，由 `usePreviewAudio` 独占。
  - **实测取值依据**：逐帧采样、拟合样本量、标准差（符合黄金判据）。
  - **硬件限制与帧预算**：如 144Hz vsync 预算仅 6.9ms，`MAX_DPR = 2` 上限截断防掉帧。
  - **平台兼容 Hack**：规避特定浏览器缺陷的非常规写法（如 Safari `alpha:false` 下必须用 `fillRect`）。
  - **命名与暂存物理单位脱节警告**：如字段名 `delayMs` 当前暂存单位实为节拍数（beat）。
  - **领域语法记号**：特定文本标记、分隔符的业务规则。
- **第二层：视情况保留 (Situational)**
  - 二分查找区间维护（如 `[lo, hi)` 左闭右开）、Canvas 路径镂空非零环绕规则。重构优先；无法自解释时**仅写 Why，绝不写 What**。
- **第三层：必须删除 (Strictly Prohibited)**
  - 语法复述（`// 遍历 notes`）、机械直译 JSDoc（`@param x X坐标`）、无副作用的构造函数套话、简单单行辅助函数的冗余 JSDoc、改动理由与性能战报。

---

## 三、案例与退化审计

### 1. 正面范例（完备契约与 Why）

- **完备黑盒契约与副作用** (`packages/maimai-chart-engine/src/effects/TouchHitEffectRenderer.ts`):
  ```typescript
  /**
   * 渲染当前时间窗口内的 Touch 命中特效。
   * - `touches` 必须按 `timingMs` 升序排列（内部二分查找依赖）。
   * - 仅渲染普通 Touch，自动忽略 `TouchHoldStartNote`。
   * - 判定特效窗口为 `[timingMs, timingMs + 500ms)`；同传感器重叠仅保留最新特效。
   * - 绘制副作用：使用 "lighter" 混合模式，函数内部自行 save/restore 绘制状态。
   */
  ```
- **显式调用禁忌与保守估计依据** (`packages/maimai-chart-engine/src/core/audio/audioClock.ts`):
  ```typescript
  /**
   * 返回估算已到达物理输出端（听众正听到）的 AudioContext 时刻（秒）。
   * 【调用禁忌】已扣除输出延迟（处于过去），严禁传入 source.start() 等音频调度方法。
   */
  // 取较小值作保守估计，防止时间戳抖动导致画面超前于听感
  const outputTime =
    timestampTime === null ? latencyAdjustedTime : Math.min(timestampTime, latencyAdjustedTime);
  ```
- **隐蔽时空偏移与 `@throws`** (`packages/maimai-chart-engine/src/core/parser/Ma2Parser.ts`):
  ```typescript
  /**
   * 解析文本谱面并转换为统一 Chart 结构。
   * 副作用：在谱面开头插入 1 小节（4 拍）前奏偏移，所有音符及事件时值均向后平移。
   * @throws {Error} 缺少 RESOLUTION 或 BPM_DEF 声明时抛出
   */
  ```

### 2. 经典退化案例（实测防线，严禁丢失关键信息）

- **Safari 导出透明 Hack** (`packages/maimai-chart-engine/src/renderers/MainRenderer.ts`)
  - ❌ 错误：概括为“确保背景不透明”或直接删除。
  - ✅ 正确：`// fillRect 保证导出的背景不透明。clearRect 依赖 alpha:false，移动端 Safari 不可靠，会导致导出图透明。`（防后续误改 clearRect 引发回归）。
- **144Hz 帧预算与像素节省推导** (`packages/maimai-chart-engine/src/renderers/MainRenderer.ts`)
  - ❌ 错误：删除推导过程，使数值沦为魔法常数。
  - ✅ 正确：`// 144Hz 显示器的 vsync 预算只有 6.9ms，按完整 DPR=2/3 渲染时 composite backing store 会顶满预算导致掉帧；不过手机屏幕通常物理面积小，按 DPR=2 渲染仍可接受，上限 MAX_DPR = 2 在 DPR=3 设备节省 ~56% 像素。`
- **模糊扩散比实测偏离** (`packages/maimai-chart-engine/src/renderers/NoteRenderer.ts`)
  - ❌ 错误：降级为“高斯模糊扩散半径，防止边缘光晕被截断”。
  - ✅ 正确：`SPRITE_BLUR_TAIL_RATIO = 2.5`：实测 Chromium 下描边外沿与 alpha 归零处为 `2.43×N`（六边形）与 `2.27×N`（星），非理论 `3σ=N/2` 推导的 `1.5×`；取小了逐像素对照有超 1000 个像素单向变暗。
- **Hold 波纹拟合参数与呼吸感** (`packages/maimai-chart-engine/src/effects/HoldEffectRenderer.ts`)
  - ❌ 错误：抹平成“周期内发射 3 颗，按半径线性外扩”。
  - ✅ 正确：实测 2.3s / 138 帧录像（23 颗波纹平均，`σ ≤ 0.0024R`，R 为判定圈半径）；循环内连发 3 颗（间隔 4 帧）后空 8 帧，维持同屏 1~3 颗起伏的呼吸感（否决匀速发射因其稳定在 2~3 颗无起伏）；环峰 `0.1355R` 出生，`0.735 R/s` 外扩，11 帧后在 `0.2583R` 消失；alpha 峰值 1，age 2~10 线性拟合斜率 `-0.101/帧`。
- **暂存单位脱节防坑警告** (`packages/maimai-chart-engine/src/core/parser/Ma2Parser.ts`)
  - ❌ 错误：视作代码复述直接删除。
  - ✅ 正确：`parentSlide.delayMs = delay; // 阶段暂存：此时单位为节拍数（beat），后续统一步骤才换算为毫秒`
- **架构原语与所有权边界** (`packages/maimai-chart-engine/src/core/timing/TimingTimeline.ts` 与 `AudioManager.ts`)
  - ❌ 错误：删去 `O(log n)` 复杂度契约与禁止自行开码扫描禁令；将时钟所有权模糊化为泛指的“外部时钟”。
  - ✅ 正确：`TimingTimeline` 注明为 beat 与 ms 互转唯一权威原语，构造时积分 BPM，之后为 `O(log n)` 二分查询，严禁业务层自行开码扫描；`AudioManager` 注明仅调度正解音，不持有音乐播放与 React 状态，播放与输出时钟由 `usePreviewAudio` 独占。
- **术语漂移割裂代码标识符** (`packages/maimai-chart-engine/src/types/index.ts`)
  - ❌ 错误：将 8 处 `Hold` 篡改为 22 处「长按」，与代码中的 `hold-start` / `HoldStartNote` 割裂；`HoldRenderer.ts` 出现“负责长按音符（含普通 Hold...）”自相矛盾。
  - ✅ 正确：注释名词必须与代码标识符一致（`Hold` / `Touch Hold`），严禁单方面中英互译。

### 3. 无信息量反例（坚决删除）

- **构造函数套话** (`packages/maimai-chart-engine/src/core/audio/AudioManager.ts`)
  - ❌ `/** 创建打击音调度器实例。 @param config 配置选项... */ constructor(...)` → ✅ 直接删除整段 JSDoc。
- **单行简单辅助函数过度文档化** (`packages/maimai-chart-engine/src/core/audio/audioClock.ts`)
  - ❌ `/** 校验延迟数值是否合法。仅在数值为大于 0 的有限数时返回原值... */ function getFinitePositiveLatency(...)` → ✅ 直接删除，依赖命名自解释。

---

## 四、篇幅、文风与表述规范

1. **篇幅控制**：常规注释 1~2 句话；仅公有 API 且确有 ≥3 项独立契约时才分点罗列。
2. **禁止小标题堆砌**：严禁罗列 `契约与边界：` / `结构与匹配规则：` / `映射关系：` 等分节小标题，内容不足 3 条一律不用。
3. **禁止抄录代码可见逻辑**：严禁把代码一眼可见的 `if/else` 分支阈值、枚举区间逐条抄入注释；仅写代码看不出的 Why 和调用方防踩坑约束。常量注释把数值写进描述有助理解，但每个数值必须回代码逐一核验。
4. **语调严谨，杜绝公文腔与俚语**：
   - 严禁公文腔：`本函数` / `该模块` / `旨在` / `用于实现` / `进行处理`。
   - 严禁俚语口语：`硬塞` / `搞` / `瞎` / `坑爹`。
5. **客观中性与合规性**：严禁出现商业游戏名、反编译/逆向工具名或私有数据源，统一用“实测采样”、“录像拟合”。物理量必标量纲（`ms`, `s`, `beat`, `px`, `rad`）。
6. **术语与代码标识符绝对对齐**：
   - 注释名词必须与代码标识符直接对齐（如代码为 `HoldStartNote`，注释必须写 `Hold`，严禁写成「长按」）。
   - 仅在描述物理手势交互动作时使用中文（如“按住屏幕”）。
   - 沿用仓库既有惯例（以 `git show HEAD:<file>` 为准），严禁借注释清理之机推行术语重命名。警惕分词误报（如“以拍数换算时长按指定 BPM”中的“时长按”非音符类型）。

---

## 五、事实核对与验证流水线

### 1. 人工审查与事实核对（防伪造与笔误）

- [ ] **数值与阈值核对**：注释中的每个数值、阈值、单位、默认值必须回代码逐一核对。
- [ ] **比较关系核对**：注释描述的 `<` vs `<=`, `>` vs `>=` 必须与代码分支完全一致（严禁注释写 `≤ 40ms` 但代码为 `< 40`）。
- [ ] **契约真实性**：声称的 `@throws` 条件、返回值、副作用必须与实现一致。
- [ ] **错别字通读**：逐句通读排查错别字（如将“换算”误写为“切算”）。
- **辅助对账命令**（从 diff 中捞出新增注释中的数值与比较符）：
  ```bash
   git diff -U0 -- "*.ts" "*.tsx" | grep '^[+]' | grep -E '\b[0-9]+(\.[0-9]+)?(ms|px|s|R)?\b|[<>=]'
  ```

### 2. 仓库标准验证命令

注释整理完成后，按序运行以下真实存在的命令确保语法、格式、类型与用例无破坏：

```bash
yarn lint           # 代码规范检查（--max-warnings 0）
yarn format:check   # Prettier 格式校验
yarn typecheck      # TypeScript 类型检查
yarn test           # 单元测试（Vitest 自动化套件）
yarn build          # 生产打包验证
```

### 3. 纯注释变更（代码逻辑零变动）自动化脚本

在终端执行以下 Node.js 脚本，比对工作区与 `HEAD` 剥离注释与空白后的纯代码：

```bash
node -e "
const fs = require('fs');
const { execSync } = require('child_process');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/\s+/g, '');

const files = execSync('git diff --name-only')
  .toString()
  .trim()
  .split(/\r?\n/)
  .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));

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
