# 工程依据保护案例

这些案例用于判断哪些信息不能删，不是需要复制到所有注释中的模板。路径相对仓库根目录；数字是现有采样记录，修改前核对当前源码和证据。

## 实测常量与平台限制

| 定位                                                                                   | 必须保留的信息                                                                                                                                      | 会丢失依据的简化                   |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/maimai-chart-engine/src/renderers/NoteRenderer.ts`，`SPRITE_BLUR_TAIL_RATIO` | Chromium 描边外沿至 alpha 归零的实测为六边形 `2.43×N`、星形 `2.27×N`，取 `2.5`；保留与理论推导的偏差及取值过小的像素回归依据                        | 只写“防止光晕截断”                 |
| `packages/maimai-chart-engine/src/effects/HoldEffectRenderer.ts`                       | 2.3s / 138 帧、23 颗波纹平均、误差 `σ ≤ 0.0024R`；出生半径 `0.1355R`、速度 `0.735 R/s`、11 帧后的消失半径 `0.2583R`；连发/空档节奏和 alpha 拟合依据 | 只写“按半径线性外扩”或删掉采样条件 |
| `packages/maimai-chart-engine/src/renderers/MainRenderer.ts`，DPR 限制                 | 144Hz 对应约 6.9ms 帧预算；完整 DPR 的合成成本、移动设备面积差异以及 DPR 从 3 限至 2 节省约 56% 像素的推导                                          | 只写“限制 DPR 提升性能”            |
| 同文件，背景填充                                                                       | 移动端 Safari 上 `clearRect` 依赖 `alpha:false` 仍可能导出透明背景，使用 `fillRect` 的兼容原因                                                      | 只写“确保背景不透明”               |

`R` 为判定圈半径。保留源码中更完整的采样和拟合说明；表格不是允许删减原记录的上限。

## 时间、单位与所有权

- `packages/maimai-chart-engine/src/core/audio/audioClock.ts`：物理输出时刻已扣除输出延迟，可能处于过去，不能传给 `source.start()` 调度。不要把它与调度时钟混称为“当前时间”。
- `packages/maimai-chart-engine/src/core/parser/Ma2Parser.ts`：`delayMs` 在中间阶段暂存 `beat`，之后才换算为毫秒。这是字段名无法表达的警告，不是赋值语句复述。
- `packages/maimai-chart-engine/src/core/timing/TimingTimeline.ts`：保留 beat/ms 转换的权威入口及预计算、`O(log n)` 查询契约。当前架构边界以根目录 `AGENTS.md` 为准。
- `AudioManager` 与 `usePreviewAudio`：区分正解音调度与音乐播放/可听输出时钟的所有权，不笼统改成“外部时钟”。

## 调用方契约

解析器的前奏时间偏移、抛错条件，或渲染器输入的排序要求、Canvas `save/restore` 行为，都必须根据对应实现核实。不要从相似函数复制固定偏移、窗口时长或状态恢复保证。

`HoldStartNote` 对应的领域术语沿用 `Hold`；描述手势可以说“按住屏幕”。不要仅因包含“长按”字样就判错，例如“时长按指定 BPM 换算”并非音符名称。
