# CHUNITHM 谱面引擎

本指南适用于 `packages/chunithm-chart-engine/`，补充仓库根 `AGENTS.md`。模块维护 `/chart?game=chunithm` 的谱面解析、播放计算与 WebGL 渲染实现。优先实现当前页面实际调用的路径，暂未使用的能力可在对应位置用简短 TODO 记录。

## 目录与架构契约

源码位于包内 `src/`，按以下职责组织：

| 目录                 | 职责                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `assets/`            | 资源包读取、格式选择、解码与 GPU 上传                                                                 |
| `chart/`             | 谱面解析、判定配置、生命周期、时间轴及 Worker（`protocol.ts` / `computeChart.ts` / `chartWorker.ts`） |
| `notes/`、`effects/` | 音符显示、流速、几何与 GPU 提交（`notes/render/`）；打击与粒子特效                                    |
| `stage/`             | 场景图、模型、相机与绘制（`stage/render/`、后处理 `stage/render/post/`）                              |
| `field/`、`hud/`     | 轨道、FieldWall 与游戏界面的资源及绘制                                                                |
| `audio/`、`scene/`   | 音效调度与播放能力（使用外部音频上下文）；轨道场景相机                                                |
| `loop/`、`render/`   | 时间与离散步转换；整帧队列、pass 顺序与共享帧类型（`render/frameTypes.ts`）                           |
| `gpu/`、`math/`      | 共享 GPU 状态、采样器、网格快照与数学计算；独立于业务模块                                             |

- 引擎独立于 React 和页面状态，由页面集成层（仓库根 `src/pages/public/Chart/chunithm/`）将 UI 状态转为引擎参数，通过 `@lxns-network/chunithm-chart-engine` 及其子路径导入。引擎内部使用相对导入。
- `chart/play/` 接收地键和 AIR 输入，计算游玩判定、成绩、音符状态及特效。设备协议、AIR 去抖和浏览器事件由页面的 `input/` 负责。

## 播放时钟与实时更新

- 页面集成层的 `runtime/session.ts` 调度帧与生命周期，`runtime/audio.ts` 管理 AudioContext 与音频实例。正常播放以可听输出时钟为准，暂停与拖动以目标时间为准，`requestAnimationFrame` 仅驱动画面绘制。
- 离散状态步为 120 步/秒，统一通过 `loop/audioClock.ts` 转换；画面按连续时间采样。保持谱面时间、播放倍率、用户流速、谱面变速与特效时间各自的语义。
- 流速和镜像通过实时更新路径生效；切换难度仅替换谱面相关状态，复用既有音频与纹理资源。帧率限制仅约束正常播放的画面绘制，音频轮询与音效调度保持独立；暂停、拖动和设置变更及时刷新。

## Stage 合成与 HDR 约束

- 场景、后处理中间目标及 Front2D 合成目标均使用 `RGBA16F`，高光保留至输出画布时截断。
- 严格遵循合成顺序：场景模型 → Bloom / Color2 滤镜 → 同一 HDR 链上的 Front2D / Fill → 输出画布。
- 背景 Fill 在该 HDR 链上完成压暗，保持其位置与绘制，不以跳过 Fill 或 Stage ID 特判替代。轨道模型的 `ZERO / SRC_COLOR` 乘法混合是独立路径。修改合成链后检查像素实际衰减，确认暗部变暗且高光保留。

## 资源生命周期与资产管理

- 页面层解析发布 manifest 并传入资源地址。资源解码后，释放不再需要的原始包引用。
- 遵循创建者负责释放原则：创建 GPU 资源、Worker、音频节点与事件监听的模块负责完整清理，覆盖退出、错误与取消路径。
- 仓库保留生产源码、解析器 JSON 表、运行时配置及可独立运行的测试；原始游戏导出、native capture、私有 fixture、打包工具、研究记录、录屏与临时输出存放于仓库外。

## 验证与交付

根据改动范围选择下列检查，优先复用已有测试；文档和简单转发改动无需新增测试。在前端仓库根执行：

- 引擎定向测试：`corepack yarn workspace @lxns-network/chunithm-chart-engine test src/<模块>/<文件>.test.ts`
- 页面集成测试：`corepack yarn test tests/<文件>.test.ts`
- 类型与代码检查：`corepack yarn typecheck` 与 `corepack yarn lint`
- 代码格式与构建：`corepack yarn exec oxfmt --check <文件路径>` 与 `corepack yarn build`
- 涉及交互逻辑时，针对性验证播放、暂停、拖动、循环、切难度及流速变更的实际表现。
