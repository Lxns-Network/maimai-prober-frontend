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

### GET `/api/v0/chunithm/player/{friend_code}`

获取玩家信息。

#### 权限

- `allow_third_party_fetch_player`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[Player](#player)

### GET `/api/v0/chunithm/player/qq/{qq}`

通过 QQ 号获取玩家信息。

#### 权限

- `allow_third_party_fetch_player`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `qq` | `int` | 查分器用户绑定的 QQ 号 |

#### 响应体

[Player](#player)

### GET `/api/v0/chunithm/player/{friend_code}/best`

获取玩家缓存谱面的最佳成绩。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID，与 `song_name` 冲突 |
| `song_name` | `string` | 曲名，与 `song_id` 冲突 |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |

### GET `/api/v0/chunithm/player/{friend_code}/bests`

获取玩家缓存的 Best 30、Selection 10 与 Recent 10。

::: warning 注意
在中二节奏 2026 中，玩家的 Rating 算法发生了变更，由旧版本 Best 30 和当前版本 Best 20 组成。
:::

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `bests` | [`Score[]`](#score) | Best 30 列表（将在中二节奏 2026 变更为旧版本 Best 30 列表），即最佳曲目 |
| `selections` | [`Score[]`](#score) | Selection 10 列表，即候选最佳曲目 |
| `recents` | [`Score[]`](#score) | Recent 10 列表（将在中二节奏 2026 移除），即最近游玩的最佳曲目 |
| `currents` | [`Score[]`](#score) | 当前版本 Best 20 列表（将在中二节奏 2026 加入） |

::: info 提示
Selection 10 显示 Best 30 以外理论 Rating 能够进入 Best 30 的成绩。
:::

### GET `/api/v0/chunithm/player/{friend_code}/bests`

获取玩家缓存单曲所有谱面的成绩。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID，与 `song_name` 冲突 |
| `song_name` | `string` | 曲名，与 `song_id` 冲突 |

### POST `/api/v0/chunithm/player/{friend_code}/bests/recents`

上传玩家 Recent 10 列表。

#### 权限

- `allow_third_party_write_data`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 请求体

JSON 格式的 Recent 10 列表：

| 字段名 | 类型 | 说明 |
|-|-|-|
| `recents` | [`Score[]`](#score) | Recent 10 列表 |

::: warning 注意
Recent 10 列表超过 10 条时，查分器会自动截取前 10 条。
:::

#### 请求示例

```json
{
    "recents": [
        {
            "id": 3,
            "level_index": 4,
            "score": 1010000
        }
    ]
}
```

### POST `/api/v0/chunithm/player/{friend_code}/scores`

上传玩家成绩。

#### 权限

- `allow_third_party_write_data`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 请求体

JSON 格式的玩家成绩：

| 字段名 | 类型 | 说明 |
|-|-|-|
| `scores` | [`Score[]`](#score) | 玩家成绩 |

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

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[Score[]](#score)

### GET `/api/v0/chunithm/player/{friend_code}/scores`

获取玩家缓存的所有最佳成绩（简化后）。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[SimpleScore[]](#simplescore)

### GET `/api/v0/chunithm/player/{friend_code}/heatmap`

获取玩家成绩上传热力图。

#### 权限

- `allow_third_party_fetch_history`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

日期与成绩数量的映射，键为日期（格式为 `YYYY-MM-DD`），值为该日期上传的成绩数量。

### GET `/api/v0/chunithm/player/{friend_code}/trend`

获取玩家 Rating 趋势。

#### 权限

- `allow_third_party_fetch_history`

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `22000` |

::: info 提示
指定 `version` 参数时，将会返回指定版本范围内的 Rating 趋势。
:::

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
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

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |

#### 响应体

[Score[]](#score)

### GET `/api/v0/chunithm/player/{friend_code}/{collection_type}/{collection_id}`

获取玩家收藏品进度。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |
| `collection_id` | `int` | 收藏品 ID |

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
    - 角色：`collection/`
    - 名牌版：`collection/nameplate/`
    - 地图头像：`collection/mapIcon/`
- 最近游玩记录：`record/playlog`
- Recent 10 列表：`home/playerData/ratingDetailRecent`
- 最佳成绩：
  - BASIC ~ ULTIMA：`record/musicGenre`
  - WORLD'S END：`record/worldsEndList/`

:::

::: warning 注意
不支持流式传输，上传的 HTML 源代码应当完整。
:::

## 个人 API

仅列举部分 API 接口，完整接口请参考前端调用。

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

| 字段名 | 类型 | 说明 |
|-|-|-|
| `scores` | [`Score[]`](#score) | 玩家成绩 |

## 公共 API

### GET `/api/v0/chunithm/song/list`

获取曲目列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `22000` |
| `notes` | `bool` | 值可空，是否包含谱面物量，默认值为 `false` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `songs` | [Song[]](#song) | 曲目列表 |
| `genres` | [Genre[]](#genre) | 乐曲分类列表 |
| `versions` | [Version[]](#version) | 曲目版本列表 |

### GET `/api/v0/chunithm/song/{song_id}`

获取曲目信息。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `22000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID |

#### 响应体

[Song](#song)

### GET `/api/v0/chunithm/alias/list`

获取曲目别名列表。

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `aliases` | [Alias[]](#alias) | 曲目别名列表 |

### GET `/api/v0/chunithm/{collection_type}/list`

获取收藏品列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `22000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `trophies` | [Collection[]](#collection) | 仅收藏品类型为 `trophy`，称号列表 |
| `characters` | [Collection[]](#collection) | 仅收藏品类型为 `character`，角色列表 |
| `plates` | [Collection[]](#collection) | 仅收藏品类型为 `plate`，名牌版列表 |
| `icons` | [Collection[]](#collection) | 仅收藏品类型为 `icon`，地图头像列表 |

### GET `/api/v0/chunithm/{collection_type}/{collection_id}`

获取收藏品信息。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `22000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `collection_type` | `string` | 收藏品类型，值为 `trophy`、`character`、`plate` 或 `icon` |
| `collection_id` | `int` | 收藏品 ID |

#### 响应体

[Collection](#collection)

## 游戏资源

基础 URL：`https://assets2.lxns.net/chunithm`

路径：
- 角色：`/character/{character_id}.png`
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

| 字段名 | 类型 | 说明 |
|-|-|-|
| `name` | `string` | 游戏内名称 |
| `level` | `int` | 玩家等级，最大值为 99 |
| `rating` | `float` | 玩家 Rating |
| `rating_possession` | `string` | 玩家 Rating 领域颜色 |
| `friend_code` | `int` | 好友码 |
| `class_emblem` | [`ClassEmblem`](#classemblem) | CLASS 勋章 |
| `reborn_count` | `int` | 玩家等级突破次数 |
| `over_power` | `float` | 总 OVER POWER |
| `over_power_progress` | `float` | OVER POWER 总进度 |
| `currency` | `int` | 当前金币数 |
| `total_currency` | `int` | 总金币数 |
| `total_play_count` | `int` | 总游玩次数 |
| `trophy` | [`Trophy`](#collection) | 仅上传时可空，称号 |
| `character` | [`Character`](#collection) | 值可空，角色 |
| `name_plate` | [`NamePlate`](#collection) | 值可空，名牌版 |
| `map_icon` | [`MapIcon`](#collection) | 值可空，地图头像 |
| `upload_time` | `string` | 仅[获取玩家信息](#get-apiv0chunithmplayerfriend_code)返回，玩家被同步时的 UTC 时间 |

### ClassEmblem

CLASS 勋章

| 字段名 | 类型 | 说明 |
|-|-|-|
| `base` | `int` | 缎带（通关该组别全部课题组），默认值为 0 |
| `medal` | `int` | 勋章（通关任意一组），默认值为 0 |

### Score

游玩成绩

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `song_name` | `string` | 仅获取 `Score` 时返回，曲名 |
| `level` | `string` | 仅获取 `Score` 时返回，难度标级，如 `14+` |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |
| `score` | `int` | 分数 |
| `rating` | `float` | 仅获取 `Score` 时返回，Rating |
| `over_power` | `float` | 仅获取 `Score` 时返回，OVER POWER |
| `clear` | [`ClearType`](#cleartype) | CLEAR 类型 |
| `full_combo` | [`FullComboType`](#fullcombotype) | 值可空，FULL COMBO 类型 |
| `full_chain` | [`FullChainType`](#fullchaintype) | 值可空，FULL CHAIN 类型 |
| `rank` | [`RankType`](#ranktype) | 仅获取 `Score` 时返回，评级类型 |
| `play_time` | `string` | 值可空，游玩的 UTC 时间，精确到分钟 |
| `upload_time` | `string` | 仅获取 `Score` 时返回，成绩被同步时的 UTC 时间 |
| `last_played_time` | `string` | 仅[获取成绩列表](#get-apiv0chunithmplayerfriend_codescores)、[获取最佳成绩](#get-apiv0chunithmplayerfriend_codebest)时返回，谱面最后游玩的 UTC 时间 |

::: info 提示
由于 Recent 10 列表算法尚不明确，Recent 10 列表里成绩的 `clear` 字段可能为空。
:::

::: warning 注意
上传 Recent 10 列表时，成绩仅需要上传 `id`、`level_index`、`score` 字段，其他字段会根据现有数据自动填充。
:::

### SimpleScore

游玩成绩（简化）

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `song_name` | `string` | 曲名 |
| `level` | `string` | 难度标级，如 `14+` |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |
| `clear` | [`ClearType`](#cleartype) | CLEAR 类型 |
| `full_combo` | [`FullComboType`](#fullcombotype) | 值可空，FULL COMBO 类型 |
| `full_chain` | [`FullChainType`](#fullchaintype) | 值可空，FULL CHAIN 类型 |
| `rank` | [`RankType`](#ranktype) | 评级类型 |

### RatingTrend

Rating 趋势

| 字段名 | 类型 | 说明 |
|-|-|-|
| `rating` | `float` | 总平均 Rating |
| `bests_rating` | `float` | Best 30 平均 Rating |
| `selections_rating` | `float` | Selection 10 平均 Rating |
| `recents_rating` | `float` | Recent 10（MAX）平均 Rating |
| `date` | `string` | 日期 |

::: info 提示
Recent 10 均为 Best #1 曲目，`rating` 字段的最终结果为理论不推分最高 Rating。
:::

### Song

曲目

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `title` | `string` | 曲名 |
| `artist` | `string` | 艺术家 |
| `genre` | `string` | 曲目分类 |
| `bpm` | `int` | 曲目 BPM |
| `map` | `string` | 值可空，曲目所属地图 |
| `version` | `int` | 曲目首次出现版本 |
| `rights` | `string` | 值可空，曲目版权信息 |
| `locked` | `bool` | 值可空，是否需要解锁，默认值为 `false` |
| `disabled` | `bool` | 值可空，是否被禁用，默认值为 `false` |
| `difficulties` | [`SongDifficulty[]`](#songdifficulty) | 谱面难度 |

::: info 提示
`disabled` 为 `true` 时，该曲目不会出现在 Best 30、Selection 10 中。
:::

### SongDifficulty

谱面难度

| 字段名 | 类型 | 说明 |
|-|-|-|
| `difficulty` | [`LevelIndex`](#levelindex) | 难度 |
| `level` | `string` | 难度标级 |
| `level_value` | `float` | 谱面定数 |
| `note_designer` | `string` | 谱师 |
| `version` | `int` | 谱面首次出现版本 |
| `notes` | [`Notes`](#notes) | 值可空，谱面物量 |
| `origin_id` | `int` | 仅 WORLD'S END 难度，原曲 ID |
| `kanji` | `string` | 仅 WORLD'S END 难度，谱面属性 |
| `star` | `int` | 仅 WORLD'S END 难度，谱面星级 |

### Notes

谱面物量

| 字段名 | 类型 | 说明 |
|-|-|-|
| `total` | `int` | 总物量 |
| `tap` | `int` | TAP 物量 |
| `hold` | `int` | HOLD 物量 |
| `slide` | `int` | SLIDE 物量 |
| `air` | `int` | AIR 物量 |
| `flick` | `int` | FLICK 物量 |

### Genre

乐曲分类

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 内部 ID |
| `genre` | `string` | 分类标题（日文） |

### Version

曲目版本

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 内部 ID |
| `title` | `string` | 版本标题 |
| `version` | `int` | 主要版本 ID |

### Alias

曲目别名

| 字段名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID |
| `aliases` | `string[]` | 曲目所有别名 |

### Collection

收藏品

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 收藏品 ID |
| `name` | `string` | 收藏品名称 |
| `color` | `string` | 值可空，仅玩家称号，称号颜色 |
| `level` | `int` | 值可空，仅玩家角色，角色等级 |
| `required` | [`CollectionRequired[]`](#collectionrequired) | 值可空，收藏品要求 |

::: warning 注意
在中二节奏 2026 中，`color` 字段删除 `copper`，并新增 `image`，表示称号需要使用图片展示（比如 Legend of LUMINOUS PLUS）。
:::

### CollectionRequired

收藏品要求

| 字段名 | 类型 | 说明 |
|-|-|-|
| `difficulties` | [`LevelIndex[]`](#levelindex) | 值可空，要求的谱面难度，长度为 0 时代表任意难度 |
| `rank` | [`RankType`](#ranktype) | 值可空，要求的评级类型 |
| `full_combo` | [`FullComboType`](#fullcombotype) | 值可空，要求的 FULL COMBO 类型 |
| `full_chain` | [`FullChainType`](#fullchaintype) | 值可空，要求的 FULL CHAIN 类型 |
| `songs` | [`CollectionRequiredSong[]`](#collectionrequiredsong) | 值可空，要求的曲目列表 |
| `completed` | `bool` | 值可空，要求是否全部完成 |

### CollectionRequiredSong

收藏品要求曲目

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `title` | `string` | 曲名 |
| `type` | [`SongType`](#songtype) | 谱面类型 |
| `completed` | `bool` | 值可空，要求的曲目是否完成 |
| `completed_difficulties` | [`LevelIndex[]`](#levelindex) | 值可空，已完成的难度 |

## 枚举类型

### LevelIndex

难度

| 值 | 类型 | 说明 |
|-|-|-|
| `0` | `int` | BASIC |
| `1` | `int` | ADVANCED |
| `2` | `int` | EXPERT |
| `3` | `int` | MASTER |
| `4` | `int` | ULTIMA |
| `5` | `int` | WORLD'S END |

### ClearType

CLEAR 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `catastrophy` | `string` | CATASTROPHY |
| `absolutep` | `string` | ABSOLUTE+ |
| `absolute` | `string` | ABSOLUTE |
| `brave` | `string` | BRAVE（将在中二节奏 2026 添加） |
| `hard` | `string` | HARD |
| `clear` | `string` | CLEAR |
| `failed` | `string` | FAILED |

### FullComboType

FULL COMBO 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `alljusticecritical` | `string` | AJC |
| `alljustice` | `string` | ALL JUSTICE |
| `fullcombo` | `string` | FULL COMBO |

### FullChainType

FULL CHAIN 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `fullchain` | `string` | 铂 FULL CHAIN |
| `fullchain2` | `string` | 金 FULL CHAIN |

### RankType

评级类型

| 值 | 类型 | 说明 |
|-|-|-|
| `sssp` | `string` | SSS+ |
| `sss` | `string` | SSS |
| `ssp` | `string` | SS+ |
| `ss` | `string` | SS |
| `sp` | `string` | S+ |
| `s` | `string` | S |
| `aaa` | `string` | AAA |
| `aa` | `string` | AA |
| `a` | `string` | A |
| `bbb` | `string` | BBB |
| `bb` | `string` | BB |
| `b` | `string` | B |
| `c` | `string` | C |
| `d` | `string` | D |
