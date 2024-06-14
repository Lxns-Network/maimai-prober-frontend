# 舞萌 DX API 文档

---

在本查分器中，同一首曲目的**标准、DX 谱面的曲目 ID 一致**，不存在大于 10000 的曲目 ID（如有，均会对 10000 取余处理）。宴会场曲目为例外，不分标准、DX 谱面，曲目 ID 大于 100000。

API 返回的所有时间**均为 UTC 时间**，其格式形似 `2024-01-01T00:00:00Z`，代表北京时间上午 8 时。

## 开发者 API

开发者 API 的所有请求均需要在请求头加入**开发者 API 密钥**，如果没有，请[申请成为开发者](/developer/apply)获取。

请求头示例：
```
Authorization: 9sKKK47Ewi20OroB8mhr_0zOiHO3n7jwTaU9atcf2dc=
```

### 响应结构

结果将会以 JSON 格式响应：

| 字段名 | 类型 | 说明 |
|-|-|-|
| `success` | `bool` | 请求是否成功处理 |
| `code` | `int` | HTTP 状态码，通常为 `200` |
| `message` | `string` | 值可空，请求失败理由 |
| `data` | `dict` 或 `list` | 值可空，请求结果 |

### POST `/api/v0/maimai/player`

创建或修改玩家信息。

#### 权限

- `allow_third_party_write_data`

#### 请求体

[Player](#player)

#### 请求示例

```json
{
    "name": "Ｌｘｎｓ",
    "rating": 11307,
    "friend_code": 123456789000000,
    "trophy_name": "つあメン覚醒電鉄　準急",
    "course_rank": 0,
    "class_rank": 0,
    "star": 82,
    "icon": {
        "id": 200201
    },
    "name_plate": {
        "id": 200201
    },
    "frame": {
        "id": 300101
    }
}
```

### GET `/api/v0/maimai/player/{friend_code}`

获取玩家信息。

#### 权限

- `allow_third_party_fetch_player`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[Player](#player)

### GET `/api/v0/maimai/player/qq/{qq}`

通过 QQ 号获取玩家信息。

#### 权限

- `allow_third_party_fetch_player`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `qq` | `int` | 查分器用户绑定的 QQ 号 |

#### 响应体

[Player](#player)

### GET `/api/v0/maimai/player/{friend_code}/best`

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
| `song_type` | [`SongType`](#songtype) | 谱面类型 |

### GET `/api/v0/maimai/player/{friend_code}/bests`

获取玩家缓存的 Best 50。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `standard_total` | `int` | 旧版本谱面 Best 35 总分 |
| `dx_total` | `int` | 现版本谱面 Best 15 总分 |
| `standard` | [`Score[]`](#score) | 旧版本谱面 Best 35 列表 |
| `dx` | [`Score[]`](#score) | 现版本谱面 Best 15 列表 |

### GET `/api/v0/maimai/player/{friend_code}/bests/ap`

获取玩家缓存的 All Perfect 50。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

同 [Best 50](#get-apiv0maimaiplayerfriend_codebests)。

### GET `/api/v0/maimai/player/{friend_code}/bests`

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
| `song_type` | [`SongType`](#songtype) | 谱面类型 |

#### 响应体

[Score[]](#score)

### POST `/api/v0/maimai/player/{friend_code}/scores`

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
            "id": 834,
            "type": "standard",
            "level_index": 4,
            "achievements": 101,
            "fc": null,
            "fs": null,
            "dx_score": 0,
            "play_time": "2023-12-31T16:00:00Z"
        }
    ]
}
```

### GET `/api/v0/maimai/player/{friend_code}/recents`

获取玩家缓存的 Recent 50（仅增量爬取可用），按照 `play_time` 排序。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[Score[]](#score)

### GET `/api/v0/maimai/player/{friend_code}/scores`

获取玩家缓存的所有最佳成绩（简化后）。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[SimpleScore[]](#simplescore)

### GET `/api/v0/maimai/player/{friend_code}/trend`

获取玩家 DX Rating 趋势。

#### 权限

- `allow_third_party_fetch_history`

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

> 指定 `version` 参数时，将会返回指定版本范围内的 DX Rating 趋势。

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

[RatingTrend[]](#ratingtrend)

### GET `/api/v0/maimai/player/{friend_code}/score/history`

获取玩家成绩上传历史记录。

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
| `song_type` | [`SongType`](#songtype) | 谱面类型 |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |

#### 响应体

[Score[]](#score)

### GET `/api/v0/maimai/player/{friend_code}/plate/{plate_id}`

获取玩家姓名框进度。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |
| `plate_id` | `int` | 姓名框 ID |

#### 响应体

[Plate](#collection)

## 个人 API

个人 API 的所有请求均需要在请求头加入**个人 API 密钥**，如果没有，请前往[账号详情](/user/profile)生成。

请求头示例：
```
X-User-Token: KVV1nwdHG5LWl6Gm-5TNqhFukwjVCz4YxzBqgYiUkCM=
```

### GET `/api/v0/user/maimai/player`

获取玩家信息。

#### 响应体

[Player](#player)

### GET `/api/v0/user/maimai/player/scores`

获取玩家所有成绩。

#### 响应体

[Score[]](#score)

## 公共 API

### GET `/api/v0/maimai/song/list`

获取曲目列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |
| `notes` | `bool` | 值可空，是否包含谱面物量，默认值为 `false` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `songs` | [Song[]](#song) | 曲目列表 |
| `genres` | [Genre[]](#genre) | 乐曲分类列表 |
| `versions` | [Version[]](#version) | 曲目版本列表 |

### GET `/api/v0/maimai/song/{song_id}`

获取曲目信息。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID |

#### 响应体

[Song](#song)

### GET `/api/v0/maimai/alias/list`

获取曲目别名列表。

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `aliases` | [Alias[]](#alias) | 曲目别名列表 |

### GET `/api/v0/maimai/plate/list`

获取姓名框列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `plates` | [Plate[]](#collection) | 姓名框列表 |

### GET `/api/v0/maimai/plate/{plate_id}`

获取姓名框信息。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `plate_id` | `int` | 姓名框 ID |

#### 响应体

[Plate](#collection)

### GET `/api/v0/maimai/frame/list`

获取背景列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |
| `required` | `bool` | 值可空，是否包含曲目需求，默认值为 `false` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `frames` | [Frame[]](#collection) | 背景列表 |

### GET `/api/v0/maimai/frame/{frame_id}`

获取背景信息。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `frame_id` | `int` | 背景 ID |

#### 响应体

[Frame](#collection)

### GET `/api/v0/maimai/collection-genre/list`

获取收藏品分类列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `collectionGenres` | [CollectionGenre[]](#collectiongenre) | 背景列表 |

### GET `/api/v0/maimai/collection-genre/{collection_genre_id}`

获取收藏品分类信息。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `version` | `int` | 值可空，游戏版本，默认值为 `24000` |

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `collection_genre_id` | `int` | 收藏品分类 ID |

#### 响应体

[CollectionGenre](#collectiongenre)

## 游戏资源

基础 URL：`https://assets2.lxns.net/maimai`

路径：
- 头像：`/icon/{icon_id}.png`
- 姓名框：`/plate/{plate_id}.png`
- 曲绘：`/jacket/{song_id}.png`
- 音频：`/music/{song_id}.mp3`

## 结构体

### Player

玩家

| 字段名 | 类型 | 说明 |
|-|-|-|
| `name` | `string` | 游戏内名称 |
| `rating` | `int` | 玩家 DX Rating |
| `friend_code` | `int` | 好友码 |
| `trophy` | [`Trophy`](#collection) | 仅[获取玩家信息](#get-apiv0maimaiplayerfriend_code)返回，称号 |
| `trophy_name` | `string` | 仅[创建玩家信息](#post-apiv0maimaiplayer)必选，称号 |
| `course_rank` | `int` | 段位 ID |
| `class_rank` | `int` | 阶级 ID |
| `star` | `int` | 搭档觉醒数 |
| `icon` | [`Icon`](#collection) | 值可空，头像 |
| `name_plate` | [`NamePlate`](#collection) | 值可空，姓名框 |
| `frame` | [`Frame`](#collection) | 值可空，背景 |
| `upload_time` | `string` | 仅[获取玩家信息](#get-apiv0maimaiplayerfriend_code)返回，玩家被同步时的 UTC 时间 |

> `trophy_name` 参数可能会在后续变更，请开发者注意。

### Score

游玩成绩

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `song_name` | `string` | 仅获取 `Score` 时返回，曲名 |
| `level` | `string` | 仅获取 `Score` 时返回，难度标级，如 `14+` |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |
| `achievements` | `float` | 达成率 |
| `fc` | [`FCType`](#fctype) | 值可空，FULL COMBO 类型 |
| `fs` | [`FSType`](#fstype) | 值可空，FULL SYNC 类型 |
| `dx_score` | `int` | DX 分数 |
| `dx_rating` | `float` | 仅获取 `Score` 时返回，DX Rating，计算时需要向下取整 |
| `rate` | [`RateType`](#ratetype) | 仅获取 `Score` 时返回，评级类型 |
| `type` | [`SongType`](#songtype) | 谱面类型 |
| `play_time` | `string` | 值可空，游玩的 UTC 时间，精确到分钟 |
| `upload_time` | `string` | 仅获取 `Score` 时返回，成绩被同步时的 UTC 时间 |

### SimpleScore

游玩成绩（简化）

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `song_name` | `string` | 曲名 |
| `level` | `string` | 难度标级，如 `14+` |
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |
| `fc` | [`FCType`](#fctype) | 值可空，FULL COMBO 类型 |
| `fs` | [`FSType`](#fstype) | 值可空，FULL SYNC 类型 |
| `rate` | [`RateType`](#ratetype) | 评级类型 |
| `type` | [`SongType`](#songtype) | 谱面类型 |

### RatingTrend

DX Rating 趋势

| 字段名 | 类型 | 说明 |
|-|-|-|
| `total` | `int` | 总 DX Rating |
| `standard` | `int` | 旧版本谱面总 DX Rating |
| `dx` | `int` | 现版本谱面总 DX Rating |
| `date` | `string` | 日期 |

### Song

曲目

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `title` | `string` | 曲名 |
| `artist` | `string` | 艺术家 |
| `genre` | `string` | 曲目分类 |
| `bpm` | `int` | 曲目 BPM |
| `version` | `int` | 曲目首次出现版本 |
| `rights` | `string` | 曲目版权信息 |
| `disabled` | `bool` | 值可空，是否被禁用，默认值为 `false` |
| `difficulties` | [`SongDifficulties`](#songdifficulties) | 谱面难度 |

> `disabled` 为 `true` 时，该曲目不会出现在 Best 50 中。

### SongDifficulties

谱面难度

| 字段名 | 类型 | 说明 |
|-|-|-|
| `standard` | [`SongDifficulty[]`](#songdifficulty) | 曲目标准谱面难度列表 |
| `dx` | [`SongDifficulty[]`](#songdifficulty) | 曲目 DX 谱面难度列表 |
| `utage` | [`SongDifficultyUtage[]`](#songdifficultyutage) | 可选，宴会场曲目谱面难度列表 |

> 仅宴会场曲目（曲目 ID 大于 100000）拥有 `utage` 字段。

### SongDifficulty

谱面难度

| 字段名 | 类型 | 说明 |
|-|-|-|
| `type` | [`SongType`](#songtype) | 谱面类型 |
| `difficulty` | [`LevelIndex`](#levelindex) | 难度 |
| `level` | `string` | 难度标级 |
| `level_value` | `float` | 谱面定数 |
| `note_designer` | `string` | 谱师 |
| `version` | `int` | 谱面首次出现版本 |
| `notes` | [`Notes`](#notes) | 值可空，谱面物量 |

### SongDifficultyUtage

宴会场曲目谱面难度

| 字段名 | 类型 | 说明 |
|-|-|-|
| `kanji` | `string` | 谱面属性 |
| `description` | `string` | 谱面描述 |
| `is_buddy` | `bool` | 是否为 BUDDY 谱面 |
| `notes` | [`Notes`](#notes) 或 [`BuddyNotes`](#buddynotes) | 值可空，谱面物量 |

> `is_buddy` 为 `true` 时，`notes` 为 [`BuddyNotes`](#buddynotes)。

> 其他参数与 [`SongDifficulty`](#songdifficulty) 相同。

### Notes

谱面物量

| 字段名 | 类型 | 说明 |
|-|-|-|
| `total` | `int` | 总物量 |
| `tap` | `int` | TAP 物量 |
| `hold` | `int` | HOLD 物量 |
| `slide` | `int` | SLIDE 物量 |
| `touch` | `int` | TOUCH 物量 |
| `break` | `int` | BREAK 物量 |

### BuddyNotes

仅宴会场曲目，BUDDY 谱面物量

| 字段名 | 类型 | 说明 |
|-|-|-|
| `left` | [`Notes`](#notes) | 1P 谱面物量 |
| `right` | [`Notes`](#notes) | 2P 谱面物量 |

### Genre

乐曲分类

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 内部 ID |
| `title` | `string` | 分类标题 |
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
| `description` | `string` | 值可空，收藏品说明 |
| `genre` | `string` | 值可空，除玩家称号，收藏品分类（日文） |
| `required` | [`CollectionRequired[]`](#collectionrequired) | 值可空，收藏品要求 |

### CollectionRequired

收藏品要求

| 字段名 | 类型 | 说明 |
|-|-|-|
| `difficulties` | `int[]` | 值可空，要求的谱面难度 |
| `rate` | [`RateType`](#ratetype) | 值可空，要求的评级类型 |
| `fc` | [`FCType`](#fctype) | 值可空，要求的 FULL COMBO 类型 |
| `fs` | [`FSType`](#fstype) | 值可空，要求的 FULL SYNC 类型 |
| `songs` | [`CollectionRequiredSong[]`](#collectionrequiredsong) | 值可空，要求的曲目 |
| `completed` | `bool` | 值可空，要求是否全部完成 |

### CollectionRequiredSong

收藏品要求曲目

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `title` | `string` | 曲名 |
| `type` | [`SongType`](#songtype) | 谱面类型 |
| `completed` | `bool` | 值可空，要求的曲目是否完成 |
| `completed_difficulties` | `int[]` | 值可空，已完成的难度 |

### CollectionGenre

收藏品分类

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 收藏品分类 ID |
| `title` | `string` | 分类标题 |
| `genre` | `string` | 分类标题（日文） |

## 枚举类型

### LevelIndex

难度

| 值 | 类型 | 说明 |
|-|-|-|
| `0` | `int` | BASIC |
| `1` | `int` | ADVANCED |
| `2` | `int` | EXPERT |
| `3` | `int` | MASTER |
| `4` | `int` | Re:MASTER |

> 当曲目为宴会场曲目时，该字段默认为 `0`。

### FCType

FULL COMBO 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `app` | `string` | AP+ |
| `ap` | `string` | AP |
| `fcp` | `string` | FC+ |
| `fc` | `string` | FC |

### FSType

FULL SYNC 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `fsdp` | `string` | FDX+ |
| `fsd` | `string` | FDX |
| `fsp` | `string` | FS+ |
| `fs` | `string` | FS |
| `sync` | `string` | SYNC PLAY |

### RateType

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

### SongType

谱面类型

| 值 | 类型 | 说明 |
|-|-|-|
| `standard` | `string` | 标准谱面 |
| `dx` | `string` | DX 谱面 |
| `utage` | `string` | 宴会场谱面 |

> 仅宴会场曲目（曲目 ID 大于 100000）为 `utage` 类型。
