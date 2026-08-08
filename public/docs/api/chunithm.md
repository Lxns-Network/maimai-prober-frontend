# 中二节奏 API 文档

---

## API 类型

- [开发者 API](#开发者-api)
- [个人 API](#个人-api)
- [公共 API](#公共-api)

## 开发者 API

### POST `/api/v0/chunithm/player`

创建或修改玩家信息。

#### 权限

- `allow_third_party_write_data`

#### 请求体

[Player](#player)

#### 请求示例

```json
{
  "name": "ωγαｐ×",
  "level": 1,
  "rating": 0.18,
  "friend_code": 123456789000000,
  "class_emblem": {
    "base": 0,
    "medal": 0
  },
  "reborn_count": 0,
  "over_power": 13.2,
  "over_power_progress": 0.01,
  "currency": 4500,
  "total_currency": 5000,
  "total_play_count": 2,
  "trophy": {
    "id": 866
  },
  "character": {
    "id": 16620,
    "level": 1
  },
  "name_plate": {
    "id": 10131
  },
  "map_icon": {
    "id": 19
  }
}
```

#### 响应体

无成功响应体。

### GET `/api/v0/chunithm/player/{friend_code}`

获取玩家信息。

#### 权限

- `allow_third_party_fetch_player`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

[Player](#player)

### GET `/api/v0/chunithm/player/qq/{qq}`

通过 QQ 号获取玩家信息。

#### 权限

- `allow_third_party_fetch_player`

#### URL 参数

| 参数名 | 类型  | 说明                   |
| ------ | ----- | ---------------------- |
| `qq`   | `int` | 查分器用户绑定的 QQ 号 |

#### 响应体

[Player](#player)

### GET `/api/v0/chunithm/player/{friend_code}/best`

获取玩家缓存谱面的最佳成绩。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 查询参数

| 参数名        | 类型                        | 说明                               |
| ------------- | --------------------------- | ---------------------------------- |
| `song_id`     | `int`                       | 曲目 ID；未提供 `song_name` 时使用 |
| `song_name`   | `string`                    | 曲名；同时提供时优先使用           |
| `level_index` | [`LevelIndex`](#levelindex) | 难度                               |

#### 响应体

[Score](#score)

### GET `/api/v0/chunithm/player/{friend_code}/bests`

获取玩家的 Rating 构成（即 Best 30、Selection 10 和 New 20 列表）。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

| 字段名       | 类型                | 说明                                               |
| ------------ | ------------------- | -------------------------------------------------- |
| `bests`      | [`Score[]`](#score) | 旧版本 Best 30 列表，即评分对象曲（最高）          |
| `selections` | [`Score[]`](#score) | 旧版本 Selection 10 列表，即候选评分对象曲（最高） |
| `new_bests`  | [`Score[]`](#score) | 当前版本 Best 20 列表，即评分对象曲（新曲）        |
| `recents`    | [`Score[]`](#score) | 值可空，旧版本兼容的 Recent 10 列表                |

::: info 提示
Selection 10 显示 Best 30 以外理论 Rating 能够进入 Best 30 的成绩。
:::

### GET `/api/v0/chunithm/player/{friend_code}/bests`（指定曲目）

获取玩家缓存单曲所有谱面的成绩。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 查询参数

| 参数名      | 类型     | 说明                               |
| ----------- | -------- | ---------------------------------- |
| `song_id`   | `int`    | 曲目 ID；未提供 `song_name` 时使用 |
| `song_name` | `string` | 曲名；同时提供时优先使用           |

#### 响应体

[Score[]](#score)

### GET `/api/v0/chunithm/player/{friend_code}/bests/ap`

获取玩家缓存的 All Perfect 50。

::: warning 注意
中二节奏当前未实现此端点，始终返回 HTTP `501 Not Implemented`。
:::

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

无成功响应体。

### POST `/api/v0/chunithm/player/{friend_code}/scores`

上传玩家成绩。

#### 权限

- `allow_third_party_write_data`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 请求体

JSON 格式的玩家成绩：

| 字段名   | 类型                | 说明     |
| -------- | ------------------- | -------- |
| `scores` | [`Score[]`](#score) | 玩家成绩 |

#### 响应体

[ScoreChanges[]](#scorechanges)

#### 请求示例

```json
{
  "scores": [
    {
      "id": 3,
      "level_index": 4,
      "score": 1010000,
      "clear": "clear",
      "full_combo": "alljusticecritical",
      "full_chain": null,
      "play_time": "2024-01-09T16:00:00Z"
    }
  ]
}
```

### GET `/api/v0/chunithm/player/{friend_code}/recents`

获取玩家缓存的 Recent 50，按照 `play_time` 排序。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

[Score[]](#score)

### GET `/api/v0/chunithm/player/{friend_code}/scores`

获取玩家缓存的所有最佳成绩（简化后）。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

[SimpleScore[]](#simplescore)

### GET `/api/v0/chunithm/player/{friend_code}/heatmap`

获取玩家成绩上传热力图。

#### 权限

- `allow_third_party_fetch_history`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

日期与成绩数量的映射，键为日期（格式为 `YYYY-MM-DD`），值为该日期上传的成绩数量。

### GET `/api/v0/chunithm/player/{friend_code}/trend`

获取玩家 Rating 趋势。

#### 权限

- `allow_third_party_fetch_history`

#### 查询参数

| 参数名    | 类型  | 说明                               |
| --------- | ----- | ---------------------------------- |
| `version` | `int` | 可选；不提供时使用当前最新游戏版本 |

::: info 提示
指定 `version` 参数时，将会返回指定版本范围内的 Rating 趋势。
:::

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 响应体

[RatingTrend[]](#ratingtrend)

### GET `/api/v0/chunithm/player/{friend_code}/score/history`

获取玩家成绩游玩历史记录。

::: warning 注意
该接口仅返回带有 `play_time` 的成绩。
:::

#### 权限

- `allow_third_party_fetch_history`
- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名        | 类型  | 说明   |
| ------------- | ----- | ------ |
| `friend_code` | `int` | 好友码 |

#### 查询参数

| 参数名        | 类型                        | 说明                               |
| ------------- | --------------------------- | ---------------------------------- |
| `song_id`     | `int`                       | 曲目 ID；未提供 `song_name` 时使用 |
| `song_name`   | `string`                    | 曲名；同时提供时优先使用           |
| `level_index` | [`LevelIndex`](#levelindex) | 难度                               |

#### 响应体

[Score[]](#score)

### GET `/api/v0/chunithm/player/{friend_code}/{collection_type}/{collection_id}`

获取玩家收藏品进度。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名            | 类型     | 说明                                                      |
| ----------------- | -------- | --------------------------------------------------------- |
| `friend_code`     | `int`    | 好友码                                                    |
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |
| `collection_id`   | `int`    | 收藏品 ID                                                 |

#### 响应体

[Collection](#collection)

### POST `/api/v0/chunithm/player/{friend_code}/html`

通过 NET 的 HTML 源代码上传玩家数据。

#### 权限

- `allow_third_party_write_data`

#### 请求体

文本格式的 HTML 源代码。

::: info 提示
目前仅支持以下页面的 HTML 源代码：

- 玩家信息：`home/playerData`
- 收藏品：
  - 角色：`collection`
  - 名牌版：`collection/nameplate`
  - 地图头像：`collection/mapIcon`
  - 主称号（仅图片称号可用）：`collection/trophy/setMain`
- 最近游玩记录：`record/playlog`
- 最佳成绩：
  - BASIC ~ ULTIMA：`record/musicGenre`
  - WORLD'S END：`record/worldsEndList`

:::

::: warning 注意
不支持流式传输，上传的 HTML 源代码应当完整。
:::

#### 响应体

上传成绩页面并解析出成绩时返回 [ScoreChanges[]](#scorechanges)；上传玩家资料或收藏品成功时无 `data` 字段。

## 个人 API

### GET `/api/v0/user/chunithm/player`

获取玩家信息。

#### 响应体

[Player](#player)

### GET `/api/v0/user/chunithm/player/scores`

获取玩家所有成绩。

#### 响应体

[Score[]](#score)

### POST `/api/v0/user/chunithm/player/scores`

上传玩家成绩。

#### 请求体

JSON 格式的玩家成绩：

| 字段名   | 类型                | 说明     |
| -------- | ------------------- | -------- |
| `scores` | [`Score[]`](#score) | 玩家成绩 |

#### 响应体

[ScoreChanges[]](#scorechanges)

### PUT `/api/v0/user/chunithm/player`

更新玩家收藏品。

#### 请求体

[Player](#player)（仅支持 `character`、`name_plate`、`map_icon`）

#### 响应体

无成功响应体。

### GET `/api/v0/user/chunithm/player/heatmap`

获取成绩上传热力图。

#### 响应体

日期与成绩数量的映射，键为日期（格式为 `YYYY-MM-DD`），值为该日期上传的成绩数量。

### GET `/api/v0/user/chunithm/player/trend`

获取当前用户的 Rating 趋势。

#### 查询参数

| 参数名    | 类型  | 说明                               |
| --------- | ----- | ---------------------------------- |
| `version` | `int` | 可选；不提供时使用当前最新游戏版本 |

#### 响应体

[RatingTrend[]](#ratingtrend)

### POST `/api/v0/user/chunithm/player/html`

通过 NET HTML 源代码上传玩家资料或成绩。请求体为完整 HTML，`Content-Type` 为 `text/plain`。

#### 响应体

上传成绩页面并解析出成绩时返回 [ScoreChanges[]](#scorechanges)；上传玩家资料或收藏品成功时无 `data` 字段。

### DELETE `/api/v0/user/chunithm/player/score`

删除指定曲目和难度的最近一条成绩。

#### 查询参数

| 参数名        | 类型                        | 说明                               |
| ------------- | --------------------------- | ---------------------------------- |
| `song_id`     | `int`                       | 曲目 ID；未提供 `song_name` 时使用 |
| `song_name`   | `string`                    | 曲名；同时提供时优先使用           |
| `level_index` | [`LevelIndex`](#levelindex) | 难度                               |

#### 响应体

无成功响应体。

### GET `/api/v0/user/chunithm/player/score/history`

获取指定谱面的成绩游玩历史（仅返回带有 `play_time` 的成绩）。

#### 查询参数

| 参数名        | 类型                        | 说明                               |
| ------------- | --------------------------- | ---------------------------------- |
| `song_id`     | `int`                       | 曲目 ID；未提供 `song_name` 时使用 |
| `song_name`   | `string`                    | 曲名；同时提供时优先使用           |
| `level_index` | [`LevelIndex`](#levelindex) | 难度                               |

#### 响应体

[Score[]](#score)

### GET `/api/v0/user/chunithm/player/score/ranking`

获取指定谱面的玩家成绩排名。

#### 查询参数

| 参数名        | 类型                        | 说明                               |
| ------------- | --------------------------- | ---------------------------------- |
| `song_id`     | `int`                       | 曲目 ID；未提供 `song_name` 时使用 |
| `song_name`   | `string`                    | 曲名；同时提供时优先使用           |
| `level_index` | [`LevelIndex`](#levelindex) | 难度                               |

#### 响应体

[ScoreRanking[]](#scoreranking)

### GET `/api/v0/user/chunithm/player/bests`

获取 Rating 构成或指定曲目的最佳成绩。

#### 查询参数

| 参数名      | 类型     | 说明                                   |
| ----------- | -------- | -------------------------------------- |
| `song_id`   | `int`    | 可选；未提供 `song_name` 时作为曲目 ID |
| `song_name` | `string` | 可选；同时提供时优先使用               |

#### 响应体

无曲目参数时为 [Rating 构成](#get-apiv0chunithmplayerfriend_codebests)；提供曲目参数时为 [Score[]](#score)。

### DELETE `/api/v0/user/chunithm/player/scores`

删除当前用户的全部成绩。提供 `song_id` 或 `song_name` 以及 `level_index` 时，仅删除该谱面的全部历史成绩。

#### 查询参数

| 参数名        | 类型                        | 说明                                   |
| ------------- | --------------------------- | -------------------------------------- |
| `song_id`     | `int`                       | 可选；未提供 `song_name` 时作为曲目 ID |
| `song_name`   | `string`                    | 可选；同时提供时优先使用               |
| `level_index` | [`LevelIndex`](#levelindex) | 单曲删除时使用                         |

#### 响应体

无成功响应体。

### GET `/api/v0/user/chunithm/player/scores/export/{format}`

导出当前用户成绩。

#### URL 参数

| 参数名   | 类型     | 说明         |
| -------- | -------- | ------------ |
| `format` | `string` | 固定为 `csv` |

#### 响应体

返回 `text/csv` 文件，不使用 JSON envelope。

### POST `/api/v0/user/chunithm/player/scores/import`

从 CSV 文件导入成绩；导入会覆盖当前用户已有的全部成绩（包括历史成绩）。

#### 请求体

`multipart/form-data`，文件字段名必须为 `file`。

#### 响应体

无成功响应体。

### GET `/api/v0/user/chunithm/player/{collection_type}/{collection_id}`

获取当前用户指定收藏品的完成进度。

#### URL 参数

| 参数名            | 类型     | 说明                                                      |
| ----------------- | -------- | --------------------------------------------------------- |
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |
| `collection_id`   | `int`    | 收藏品 ID                                                 |

#### 响应体

[Collection](#collection)

### GET `/api/v0/user/chunithm/player/{collection_type}`

获取当前用户指定类型的收藏品列表。

#### URL 参数

| 参数名            | 类型     | 说明                                                           |
| ----------------- | -------- | -------------------------------------------------------------- |
| `collection_type` | `string` | 收藏品类型，值为 `trophies`、`characters`、`plates` 或 `icons` |

#### 响应体

[PlayerCollection[]](#playercollection)

### GET `/api/v0/user/chunithm/player/year-in-review/{year}`

获取指定年份的年度总结。

#### URL 参数

| 参数名 | 类型  | 说明                                       |
| ------ | ----- | ------------------------------------------ |
| `year` | `int` | 总结年份，范围为 `2024` 至当前年份的前一年 |

#### 查询参数

| 参数名  | 类型   | 说明                              |
| ------- | ------ | --------------------------------- |
| `agree` | `bool` | 首次生成该年份总结时必填为 `true` |

#### 响应体

[YearInReview](#yearinreview)

### POST `/api/v0/user/chunithm/player/year-in-review/{year}/share`

设置年度总结是否公开。

#### URL 参数

| 参数名 | 类型  | 说明                                                         |
| ------ | ----- | ------------------------------------------------------------ |
| `year` | `int` | 总结年份，范围为 `2024` 至当前年份；应与已生成的年度总结一致 |

#### 请求体

```json
{
  "public": true
}
```

#### 响应体

| 字段名        | 类型     | 说明                           |
| ------------- | -------- | ------------------------------ |
| `share_token` | `string` | 公开时返回；取消公开时为空数据 |

## 公共 API

### GET `/api/v0/chunithm/crawl/statistic`

获取近期玩家数据爬取统计。

#### 响应体

| 字段名               | 类型    | 说明                              |
| -------------------- | ------- | --------------------------------- |
| `success_rate`       | `float` | 近期爬取成功率，范围为 `0` 至 `1` |
| `average_crawl_time` | `int`   | 平均爬取耗时，单位为毫秒          |

### GET `/api/v0/chunithm/year-in-review/{year}/share/{share_token}`

获取公开的年度总结。

#### URL 参数

| 参数名        | 类型     | 说明                               |
| ------------- | -------- | ---------------------------------- |
| `year`        | `int`    | 总结年份，范围为 `2024` 至当前年份 |
| `share_token` | `string` | 年度总结分享令牌                   |

#### 响应体

[YearInReview](#yearinreview)

### GET `/api/v0/chunithm/wechat/auth`

获取中二节奏微信 OAuth 授权地址。

#### 查询参数

| 参数名  | 类型     | 说明                        |
| ------- | -------- | --------------------------- |
| `token` | `string` | 可选，Base64 编码的爬取令牌 |

#### 响应

返回 HTTP `302 Found`，通过 `Location` 响应头重定向到微信授权页面，不返回 JSON 响应体。

### GET `/api/v0/chunithm/song/list`

获取曲目列表。

#### 查询参数

| 参数名    | 类型   | 说明                                       |
| --------- | ------ | ------------------------------------------ |
| `version` | `int`  | 可选；不提供时使用当前最新游戏版本         |
| `notes`   | `bool` | 值可空，是否包含谱面物量，默认值为 `false` |

#### 响应体

| 字段名     | 类型                  | 说明         |
| ---------- | --------------------- | ------------ |
| `songs`    | [Song[]](#song)       | 曲目列表     |
| `genres`   | [Genre[]](#genre)     | 乐曲分类列表 |
| `versions` | [Version[]](#version) | 曲目版本列表 |

### GET `/api/v0/chunithm/song/{song_id}`

获取曲目信息。

#### 查询参数

| 参数名    | 类型  | 说明                               |
| --------- | ----- | ---------------------------------- |
| `version` | `int` | 可选；不提供时使用当前最新游戏版本 |

#### URL 参数

| 参数名    | 类型  | 说明    |
| --------- | ----- | ------- |
| `song_id` | `int` | 曲目 ID |

#### 响应体

[Song](#song)

### GET `/api/v0/chunithm/song-collections/{song_id}`

获取与指定曲目关联的收藏品引用。

#### 查询参数

| 参数名    | 类型  | 说明                               |
| --------- | ----- | ---------------------------------- |
| `version` | `int` | 可选；不提供时使用当前最新资源版本 |

#### URL 参数

| 参数名    | 类型  | 说明    |
| --------- | ----- | ------- |
| `song_id` | `int` | 曲目 ID |

#### 响应体

[CollectionReference[]](#collectionreference)

### GET `/api/v0/chunithm/alias/list`

获取曲目别名列表。

#### 响应体

| 字段名    | 类型              | 说明         |
| --------- | ----------------- | ------------ |
| `aliases` | [Alias[]](#alias) | 曲目别名列表 |

### GET `/api/v0/chunithm/{collection_type}/list`

获取收藏品列表。

#### 查询参数

| 参数名    | 类型  | 说明                               |
| --------- | ----- | ---------------------------------- |
| `version` | `int` | 可选；不提供时使用当前最新游戏版本 |

#### URL 参数

| 参数名            | 类型     | 说明                                                      |
| ----------------- | -------- | --------------------------------------------------------- |
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |

#### 响应体

| 字段名       | 类型                        | 说明                                 |
| ------------ | --------------------------- | ------------------------------------ |
| `trophies`   | [Collection[]](#collection) | 仅收藏品类型为 `trophy`，称号列表    |
| `characters` | [Collection[]](#collection) | 仅收藏品类型为 `character`，角色列表 |
| `plates`     | [Collection[]](#collection) | 仅收藏品类型为 `plate`，名牌版列表   |
| `icons`      | [Collection[]](#collection) | 仅收藏品类型为 `icon`，地图头像列表  |

### GET `/api/v0/chunithm/{collection_type}/{collection_id}`

获取收藏品信息。

#### 查询参数

| 参数名    | 类型  | 说明                               |
| --------- | ----- | ---------------------------------- |
| `version` | `int` | 可选；不提供时使用当前最新游戏版本 |

#### URL 参数

| 参数名            | 类型     | 说明                                                      |
| ----------------- | -------- | --------------------------------------------------------- |
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |
| `collection_id`   | `int`    | 收藏品 ID                                                 |

#### 响应体

[Collection](#collection)

## 游戏资源

基础 URL：`https://assets2.lxns.net/chunithm`

路径：

- 角色：`/character/{character_id}.png`
- 称号（仅图片）：`/trophy/{trophy_id}.png`
- 名牌版：`/plate/{plate_id}.png`
- 地图头像：`/icon/{map_icon_id}.png`
- 曲绘：`/jacket/{song_id}.png`
- 音频：`/music/{song_id}.mp3`

::: info 提示
WORLD'S END 难度的 `song_id` 为 [SongDifficulty](#songdifficulty) 中 `origin_id` 字段的值。
:::

::: warning 注意
游戏资源的访问频率有限制，请勿频繁请求。
:::

## 结构体

### Player

玩家

| 字段名                | 类型                          | 说明                                                                               |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `name`                | `string`                      | 游戏内名称                                                                         |
| `level`               | `int`                         | 玩家等级，最大值为 99                                                              |
| `rating`              | `float`                       | 玩家 Rating                                                                        |
| `rating_possession`   | `string`                      | 玩家 Rating 领域颜色                                                               |
| `friend_code`         | `int`                         | 好友码                                                                             |
| `class_emblem`        | [`ClassEmblem`](#classemblem) | CLASS 勋章                                                                         |
| `reborn_count`        | `int`                         | 玩家等级突破次数                                                                   |
| `over_power`          | `float`                       | 总 OVER POWER                                                                      |
| `over_power_progress` | `float`                       | OVER POWER 总进度                                                                  |
| `currency`            | `int`                         | 当前金币数                                                                         |
| `total_currency`      | `int`                         | 总金币数                                                                           |
| `total_play_count`    | `int`                         | 总游玩次数                                                                         |
| `trophy`              | [`Trophy`](#collection)       | 仅上传时可空，称号                                                                 |
| `character`           | [`Character`](#collection)    | 值可空，角色                                                                       |
| `name_plate`          | [`NamePlate`](#collection)    | 值可空，名牌版                                                                     |
| `map_icon`            | [`MapIcon`](#collection)      | 值可空，地图头像                                                                   |
| `upload_time`         | `string`                      | 仅[获取玩家信息](#get-apiv0chunithmplayerfriend_code)返回，玩家被同步时的 UTC 时间 |

### ClassEmblem

CLASS 勋章

| 字段名  | 类型  | 说明                                     |
| ------- | ----- | ---------------------------------------- |
| `base`  | `int` | 缎带（通关该组别全部课题组），默认值为 0 |
| `medal` | `int` | 勋章（通关任意一组），默认值为 0         |

### Score

游玩成绩

| 字段名             | 类型                              | 说明                                                                                                                                                |
| ------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | `int`                             | 曲目 ID                                                                                                                                             |
| `song_name`        | `string`                          | 仅获取 `Score` 时返回，曲名                                                                                                                         |
| `level`            | `string`                          | 仅获取 `Score` 时返回，难度标级，如 `14+`                                                                                                           |
| `level_index`      | [`LevelIndex`](#levelindex)       | 难度                                                                                                                                                |
| `score`            | `int`                             | 分数                                                                                                                                                |
| `rating`           | `float`                           | 仅获取 `Score` 时返回，Rating                                                                                                                       |
| `over_power`       | `float`                           | 仅获取 `Score` 时返回，OVER POWER                                                                                                                   |
| `clear`            | [`ClearType`](#cleartype)         | CLEAR 类型                                                                                                                                          |
| `full_combo`       | [`FullComboType`](#fullcombotype) | 值可空，FULL COMBO 类型                                                                                                                             |
| `full_chain`       | [`FullChainType`](#fullchaintype) | 值可空，FULL CHAIN 类型                                                                                                                             |
| `rank`             | [`RankType`](#ranktype)           | 仅获取 `Score` 时返回，评级类型                                                                                                                     |
| `play_time`        | `string`                          | 值可空，游玩的 UTC 时间，精确到分钟                                                                                                                 |
| `upload_time`      | `string`                          | 仅获取 `Score` 时返回，成绩被同步时的 UTC 时间                                                                                                      |
| `last_played_time` | `string`                          | 仅[获取成绩列表](#get-apiv0chunithmplayerfriend_codescores)、[获取最佳成绩](#get-apiv0chunithmplayerfriend_codebest)时返回，谱面最后游玩的 UTC 时间 |

### SimpleScore

游玩成绩（简化）

| 字段名        | 类型                              | 说明                    |
| ------------- | --------------------------------- | ----------------------- |
| `id`          | `int`                             | 曲目 ID                 |
| `song_name`   | `string`                          | 曲名                    |
| `level`       | `string`                          | 难度标级，如 `14+`      |
| `level_index` | [`LevelIndex`](#levelindex)       | 难度                    |
| `clear`       | [`ClearType`](#cleartype)         | CLEAR 类型              |
| `full_combo`  | [`FullComboType`](#fullcombotype) | 值可空，FULL COMBO 类型 |
| `full_chain`  | [`FullChainType`](#fullchaintype) | 值可空，FULL CHAIN 类型 |
| `rank`        | [`RankType`](#ranktype)           | 评级类型                |

### RatingTrend

Rating 趋势

| 字段名              | 类型     | 说明                                                  |
| ------------------- | -------- | ----------------------------------------------------- |
| `rating`            | `float`  | 总平均 Rating                                         |
| `bests_rating`      | `float`  | Best 30 平均 Rating                                   |
| `selections_rating` | `float`  | Selection 10 平均 Rating                              |
| `recents_rating`    | `float`  | 中二节奏 2026 及以后可空，Recent 10（MAX）平均 Rating |
| `new_bests_rating`  | `float`  | 中二节奏 2026 前可空，Best 20（新曲）平均 Rating      |
| `date`              | `string` | 日期                                                  |

::: info 提示
Recent 10 均为 Best #1 曲目，`rating` 字段的最终结果为理论不推分最高 Rating。
:::

### ScoreChangeDetail

成绩字段变化

| 字段名 | 类型  | 说明                         |
| ------ | ----- | ---------------------------- |
| `old`  | `any` | 变化前的值，新增成绩时可为空 |
| `new`  | `any` | 变化后的值，没有变化时可为空 |

### ScoreChanges

成绩上传变化

| 字段名        | 类型                                      | 说明            |
| ------------- | ----------------------------------------- | --------------- |
| `id`          | `int`                                     | 曲目 ID         |
| `song_name`   | `string`                                  | 曲名            |
| `level`       | `string`                                  | 难度标级        |
| `level_index` | [`LevelIndex`](#levelindex)               | 难度            |
| `score`       | [`ScoreChangeDetail`](#scorechangedetail) | 分数变化        |
| `rating`      | [`ScoreChangeDetail`](#scorechangedetail) | Rating 变化     |
| `over_power`  | [`ScoreChangeDetail`](#scorechangedetail) | OVER POWER 变化 |
| `clear`       | [`ScoreChangeDetail`](#scorechangedetail) | CLEAR 变化      |
| `full_combo`  | [`ScoreChangeDetail`](#scorechangedetail) | FULL COMBO 变化 |
| `full_chain`  | [`ScoreChangeDetail`](#scorechangedetail) | FULL CHAIN 变化 |

### ScoreRanking

谱面成绩排名

| 字段名        | 类型     | 说明                |
| ------------- | -------- | ------------------- |
| `ranking`     | `int`    | 排名                |
| `player_name` | `string` | 值可空，玩家名称    |
| `score`       | `int`    | 分数                |
| `upload_time` | `string` | 成绩上传的 UTC 时间 |
| `friend_code` | `int`    | 值可空，玩家好友码  |

### Song

曲目

| 字段名         | 类型                                  | 说明                                   |
| -------------- | ------------------------------------- | -------------------------------------- |
| `id`           | `int`                                 | 曲目 ID                                |
| `title`        | `string`                              | 曲名                                   |
| `artist`       | `string`                              | 艺术家                                 |
| `genre`        | `string`                              | 曲目分类                               |
| `bpm`          | `int`                                 | 曲目 BPM                               |
| `map`          | `string`                              | 值可空，曲目所属地图                   |
| `version`      | `int`                                 | 曲目首次出现版本                       |
| `rights`       | `string`                              | 值可空，曲目版权信息                   |
| `locked`       | `bool`                                | 值可空，是否需要解锁，默认值为 `false` |
| `disabled`     | `bool`                                | 值可空，是否被禁用，默认值为 `false`   |
| `difficulties` | [`SongDifficulty[]`](#songdifficulty) | 谱面难度                               |

::: info 提示
`disabled` 为 `true` 时，该曲目不会出现在 Rating 构成中。
:::

### SongDifficulty

谱面难度

| 字段名          | 类型                        | 说明                          |
| --------------- | --------------------------- | ----------------------------- |
| `difficulty`    | [`LevelIndex`](#levelindex) | 难度                          |
| `level`         | `string`                    | 难度标级                      |
| `level_value`   | `float`                     | 谱面定数                      |
| `note_designer` | `string`                    | 谱师                          |
| `version`       | `int`                       | 谱面首次出现版本              |
| `notes`         | [`Notes`](#notes)           | 值可空，谱面物量              |
| `origin_id`     | `int`                       | 仅 WORLD'S END 难度，原曲 ID  |
| `kanji`         | `string`                    | 仅 WORLD'S END 难度，谱面属性 |
| `star`          | `int`                       | 仅 WORLD'S END 难度，谱面星级 |

### Notes

谱面物量

| 字段名  | 类型  | 说明       |
| ------- | ----- | ---------- |
| `total` | `int` | 总物量     |
| `tap`   | `int` | TAP 物量   |
| `hold`  | `int` | HOLD 物量  |
| `slide` | `int` | SLIDE 物量 |
| `air`   | `int` | AIR 物量   |
| `flick` | `int` | FLICK 物量 |

### Genre

乐曲分类

| 字段名  | 类型     | 说明     |
| ------- | -------- | -------- |
| `id`    | `int`    | 内部 ID  |
| `genre` | `string` | 分类标题 |

### Version

曲目版本

| 字段名    | 类型     | 说明        |
| --------- | -------- | ----------- |
| `id`      | `int`    | 内部 ID     |
| `title`   | `string` | 版本标题    |
| `version` | `int`    | 主要版本 ID |

### Alias

曲目别名

| 字段名    | 类型       | 说明         |
| --------- | ---------- | ------------ |
| `song_id` | `int`      | 曲目 ID      |
| `aliases` | `string[]` | 曲目所有别名 |

### Collection

收藏品

| 字段名        | 类型                                          | 说明                         |
| ------------- | --------------------------------------------- | ---------------------------- |
| `id`          | `int`                                         | 收藏品 ID                    |
| `name`        | `string`                                      | 收藏品名称                   |
| `color`       | [`TrophyColor`](#trophycolor)                 | 值可空，仅玩家称号，称号颜色 |
| `description` | `string`                                      | 收藏品说明                   |
| `required`    | [`CollectionRequired[]`](#collectionrequired) | 值可空，收藏品要求           |

::: warning 注意
`color` 字段为 `image` 时，表示称号需要使用图片展示（比如 Legend of LUMINOUS）。
:::

### PlayerCollection

玩家收藏品

| 字段名  | 类型                          | 说明             |
| ------- | ----------------------------- | ---------------- |
| `id`    | `int`                         | 收藏品 ID        |
| `name`  | `string`                      | 收藏品名称       |
| `color` | [`TrophyColor`](#trophycolor) | 值可空，称号颜色 |
| `level` | `int`                         | 值可空，角色等级 |

### CollectionReference

曲目关联的收藏品引用

| 字段名  | 类型     | 说明             |
| ------- | -------- | ---------------- |
| `type`  | `string` | 收藏品类型       |
| `id`    | `int`    | 收藏品 ID        |
| `name`  | `string` | 收藏品名称       |
| `color` | `string` | 值可空，称号颜色 |

### CollectionRequired

收藏品要求

| 字段名         | 类型                                                  | 说明                                            |
| -------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `difficulties` | [`LevelIndex[]`](#levelindex)                         | 值可空，要求的谱面难度，长度为 0 时代表任意难度 |
| `rank`         | [`RankType`](#ranktype)                               | 值可空，要求的评级类型                          |
| `full_combo`   | [`FullComboType`](#fullcombotype)                     | 值可空，要求的 FULL COMBO 类型                  |
| `full_chain`   | [`FullChainType`](#fullchaintype)                     | 值可空，要求的 FULL CHAIN 类型                  |
| `songs`        | [`CollectionRequiredSong[]`](#collectionrequiredsong) | 值可空，要求的曲目列表                          |
| `completed`    | `bool`                                                | 值可空，要求是否全部完成                        |

### CollectionRequiredSong

收藏品要求曲目

| 字段名                   | 类型                          | 说明                       |
| ------------------------ | ----------------------------- | -------------------------- |
| `id`                     | `int`                         | 曲目 ID                    |
| `title`                  | `string`                      | 曲名                       |
| `completed`              | `bool`                        | 值可空，要求的曲目是否完成 |
| `completed_difficulties` | [`LevelIndex[]`](#levelindex) | 值可空，已完成的难度       |

### MostUploadedSong

年度上传最多的曲目

| 字段名           | 类型  | 说明                        |
| ---------------- | ----- | --------------------------- |
| `latest_version` | `int` | 当前版本中上传最多的曲目 ID |
| `all_version`    | `int` | 所有版本中上传最多的曲目 ID |

### RatingGrowth

年度 Rating 增长

| 字段名           | 类型     | 说明                                                                       |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `earliest_bests` | `object` | 年度最早成绩时点的 [Rating 构成](#get-apiv0chunithmplayerfriend_codebests) |
| `latest_bests`   | `object` | 年度最晚成绩时点的 [Rating 构成](#get-apiv0chunithmplayerfriend_codebests) |

### YearInReview

年度总结

| 字段名                       | 类型                                    | 说明                                       |
| ---------------------------- | --------------------------------------- | ------------------------------------------ |
| `game`                       | `string`                                | 游戏类型，固定为 `chunithm`                |
| `year`                       | `int`                                   | 总结年份                                   |
| `latest_version`             | `int`                                   | 当前最新游戏版本                           |
| `player_name`                | `string`                                | 玩家名称                                   |
| `player_avatar_id`           | `int`                                   | 玩家角色收藏品 ID                          |
| `player_total_uploads`       | `map[int]int`                           | 以游戏版本 ID 为键的玩家成绩上传数量       |
| `prober_total_uploads`       | `int`                                   | 查分器在该年份的成绩上传总数               |
| `player_most_uploaded_song`  | [`MostUploadedSong`](#mostuploadedsong) | 上传次数最多的曲目                         |
| `player_most_uploaded_songs` | `map[int]int`                           | 以曲目 ID 为键的上传次数（最多 10 首）     |
| `player_upload_days`         | `int`                                   | 上传成绩的天数                             |
| `player_tags`                | `map[int]float`                         | 不返回，中二节奏没有曲目标签权重数据       |
| `player_monthly_uploads`     | `map[int]int`                           | 以月份（`1` 至 `12`）为键的成绩上传数量    |
| `player_hourly_uploads`      | `map[int]int`                           | 以偶数小时为键的成绩上传数量               |
| `player_song_timeline`       | `map[int][]int`                         | 以月份为键的曲目 ID 列表（每月最多 3 首）  |
| `generate_time`              | `string`                                | 生成时间（UTC）                            |
| `rate_distribute`            | `map[string]int`                        | 不返回，中二节奏使用 `rank_distribute`     |
| `rank_distribute`            | `map[string]int`                        | 值可空，评级分布；仅 2025 年及以后         |
| `full_combo_distribute`      | `map[string]int`                        | 值可空，FULL COMBO 分布；仅 2025 年及以后  |
| `rating_growth`              | [`RatingGrowth`](#ratinggrowth)         | 值可空，年度 Rating 增长；仅 2025 年及以后 |
| `difficulty_distribute`      | `map[string]int`                        | 值可空，难度标级分布；仅 2025 年及以后     |
| `most_played_genres`         | `map[string]int`                        | 值可空，曲目分类分布；仅 2025 年及以后     |
| `most_played_bpm_ranges`     | `map[string]int`                        | 值可空，BPM 区间分布；仅 2025 年及以后     |

## 枚举类型

### LevelIndex

难度

| 值  | 类型  | 说明        |
| --- | ----- | ----------- |
| `0` | `int` | BASIC       |
| `1` | `int` | ADVANCED    |
| `2` | `int` | EXPERT      |
| `3` | `int` | MASTER      |
| `4` | `int` | ULTIMA      |
| `5` | `int` | WORLD'S END |

### ClearType

CLEAR 类型

| 值            | 类型     | 说明        |
| ------------- | -------- | ----------- |
| `catastrophy` | `string` | CATASTROPHY |
| `absolute`    | `string` | ABSOLUTE    |
| `brave`       | `string` | BRAVE       |
| `hard`        | `string` | HARD        |
| `clear`       | `string` | CLEAR       |
| `failed`      | `string` | FAILED      |

### FullComboType

FULL COMBO 类型

| 值                   | 类型     | 说明        |
| -------------------- | -------- | ----------- |
| `alljusticecritical` | `string` | AJC         |
| `alljustice`         | `string` | ALL JUSTICE |
| `fullcombo`          | `string` | FULL COMBO  |

### FullChainType

FULL CHAIN 类型

| 值           | 类型     | 说明          |
| ------------ | -------- | ------------- |
| `fullchain`  | `string` | 铂 FULL CHAIN |
| `fullchain2` | `string` | 金 FULL CHAIN |

### RankType

评级类型

| 值     | 类型     | 说明 |
| ------ | -------- | ---- |
| `sssp` | `string` | SSS+ |
| `sss`  | `string` | SSS  |
| `ssp`  | `string` | SS+  |
| `ss`   | `string` | SS   |
| `sp`   | `string` | S+   |
| `s`    | `string` | S    |
| `aaa`  | `string` | AAA  |
| `aa`   | `string` | AA   |
| `a`    | `string` | A    |
| `bbb`  | `string` | BBB  |
| `bb`   | `string` | BB   |
| `b`    | `string` | B    |
| `c`    | `string` | C    |
| `d`    | `string` | D    |

### TrophyColor

| 值        | 类型     | 说明                     |
| --------- | -------- | ------------------------ |
| `normal`  | `string` | 普通                     |
| `copper`  | `string` | 铜（已弃用，仅作保留）   |
| `silver`  | `string` | 银                       |
| `gold`    | `string` | 金                       |
| `platina` | `string` | 铂金                     |
| `rainbow` | `string` | 虹                       |
| `image`   | `string` | 图片，目前仅版本制霸称号 |
