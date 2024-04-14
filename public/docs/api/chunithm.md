# 中二节奏 API 文档

---

API 返回的所有时间**均为 UTC 时间**，其格式形似 `2024-01-01T00:00:00Z`，代表北京时间上午 8 时。

## 开发者 API

开发者 API 的所有请求均需要在请求头加入 API 密钥，如果没有，请[申请成为开发者](/developer/apply)获取。

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
    "over_power": 13.2,
    "change_over_power": 0.01,
    "currency": 4500,
    "total_currency": 5000,
    "total_play_count": 2,
    "trophy": {
        "id": 866
    },
    "character": {
        "id": 16620
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

> Selection 10 为 Best 31 至 40。

#### 权限

- `allow_third_party_fetch_scores`

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `friend_code` | `int` | 好友码 |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `bests` | [`Score[]`](#score) | Best 30 列表 |
| `selections` | [`Score[]`](#score) | Selection 10 列表 |
| `recents` | [`Score[]`](#score) | Recent 10 列表 |

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
            "full_combo": "alljustice",
            "full_chain": "fullchain2",
            "play_time": "2024-01-09T16:00:00Z"
        }
    ]
}
```

### GET `/api/v0/chunithm/player/{friend_code}/recents`

获取玩家缓存的 Recent 10，按照 `play_time` 排序。

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

### GET `/api/v0/chunithm/player/{friend_code}/score/history`

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
| `level_index` | [`LevelIndex`](#levelindex) | 难度 |

#### 响应体

[Score[]](#score)

## 公共 API

### GET `/api/v0/chunithm/song/list`

获取曲目列表。

#### 查询参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `notes` | `bool` | 值可空，是否包含谱面物量，默认值为 `false` |

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `songs` | [SongDifficulty[]](#song) | 曲目列表 |
| `genres` | [Genre[]](#genre) | 乐曲分类列表 |
| `versions` | [Version[]](#version) | 曲目版本列表 |

### GET `/api/v0/chunithm/song/{song_id}`

获取曲目信息。

#### URL 参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `song_id` | `int` | 曲目 ID |

#### 响应体

[SongDifficulty](#song)

### GET `/api/v0/chunithm/alias/list`

获取曲目别名列表。

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `aliases` | [Alias[]](#alias) | 曲目别名列表 |

## 游戏资源

基础 URL：`https://assets2.lxns.net/chunithm`

路径：
- 角色：`/character/{character_id}.png`
- 曲绘：`/jacket/{song_id}.png`
- 音频：`/music/{song_id}.mp3`

## 结构体

### Player

玩家

| 字段名 | 类型 | 说明 |
|-|-|-|
| `name` | `string` | 游戏内名称 |
| `level` | `string` | 玩家等级 |
| `rating` | `int` | 玩家 Rating |
| `friend_code` | `int` | 好友码 |
| `over_power` | `int` | 总 OVER POWER |
| `change_over_power` | `int` | 上局游戏中变更的 OVER POWER |
| `currency` | `string` | 当前金币数 |
| `total_currency` | `string` | 总金币数 |
| `total_play_count` | `string` | 总游玩次数 |
| `trophy` | [`Trophy`](#collection) | 称号 |
| `character` | [`Character`](#collection) | 角色 |
| `name_plate` | [`NamePlate`](#collection) | 名牌版 |
| `map_icon` | [`MapIcon`](#collection) | 地图头像 |
| `upload_time` | `string` | 仅[获取玩家信息](#get-apiv0maimaiplayerfriend_code)返回，玩家被同步时的 UTC 时间 |

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
| `clear` | [`ClearType`](#cleartype) | CLEAR 类型 |
| `full_combo` | [`FullComboType`](#fullcombotype) | 值可空，FULL COMBO 类型 |
| `full_chain` | [`FullChainType`](#fullchaintype) | 值可空，FULL CHAIN 类型 |
| `rank` | [`RankType`](#ratetype) | 仅获取 `Score` 时返回，评级类型 |
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
| `clear` | [`ClearType`](#cleartype) | CLEAR 类型 |
| `full_combo` | [`FullComboType`](#fullcombotype) | 值可空，FULL COMBO 类型 |
| `full_chain` | [`FullChainType`](#fullchaintype) | 值可空，FULL CHAIN 类型 |
| `rank` | [`RankType`](#ratetype) | 评级类型 |

### SongDifficulty

曲目

| 字段名 | 类型 | 说明 |
|-|-|-|
| `id` | `int` | 曲目 ID |
| `title` | `string` | 曲名 |
| `artist` | `string` | 艺术家 |
| `genre` | `string` | 曲目分类 |
| `bpm` | `int` | 曲目 BPM |
| `version` | `int` | 曲目首次出现版本 |
| `difficulties` | [`SongDifficulty[]`](#songdifficulty) | 谱面难度 |

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

### ClearType

CLEAR 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `clear` | `string` | CLEAR |
| `failed` | `string` | FAILED |

### FullComboType

FULL COMBO 类型

| 值 | 类型 | 说明 |
|-|-|-|
| `alljustice` | `string` | ALL JUSTICE |
| `fullcombo` | `string` | FULL COMBO |

> AJC 显示为 ALL JUSTICE，需要开发者自行判断。

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
