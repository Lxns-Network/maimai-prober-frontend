# 账号设置

---

## 爬取数据

### 舞萌 DX

#### 爬取谱面成绩的方式

设置每次爬取时使用的爬取方式，增量爬取依赖最近游玩记录，适合已经完整爬取后频繁爬取，更加稳定。

> 当爬取方式为自动检测时，会先尝试使用增量爬取。爬取后若检测到玩家 DX Rating 与成绩不一致时，会使用完整爬取重新爬取一次。

| 特性 | 自动检测 | 完整爬取 | 增量爬取 |
|-|-|-|-|
| 成绩爬取数量 | - | 全部 | 最多 50 条 |
| 爬取游玩时间 | ✔️ | ❌ | ✔️ |
| 爬取非最佳成绩 | ✔️ | ❌ | ✔️ |
| 爬取速度 | - | 慢 | 相对较快 |
| 成绩来源 | - | 最佳成绩 | 最近游玩记录 |

::: warning 注意
完整爬取爬取的是**历史最佳** Full Combo、Full Sync、DX 分数（下称参数），并非增量爬取爬取的当前成绩的真实参数。在部分情况下，自动检测可能会出现来自不同爬取方式的同一个成绩（但参数不一致）。
:::

### 通用选项

#### 允许覆盖最佳成绩

允许后，每次“完整爬取”或通过第三方开发者写入时会检查成绩是否低于最佳成绩，低于则覆盖最佳成绩。

##### 适用场景

- 你导入了其他玩家的成绩（如通过第三方开发者）
- 你手动创建了错误成绩

::: warning 注意
目前不支持使用空成绩（即在 NET 中没有显示的成绩）覆盖最佳成绩。达成率 0% 的成绩可以覆盖最佳成绩。
:::