# 开发者入驻指南

---

欢迎来到[落雪咖啡屋 maimai DX 查分器](/)的开发者入驻指南！

## 快速开始

如果你是第一次使用 API，可以先尝试调用一个简单的接口。下面以获取舞萌 DX 玩家信息为例：

### 1. 获取 API 密钥

- **开发者 API**：前往[开发者面板](/developer)申请成为开发者，获取开发者 API 密钥。
- **个人 API**：前往[账号详情](/user/profile)生成个人 API 密钥。
- **OAuth API**：参见 [OAuth 接入指南](/docs/oauth-guide)。

### 2. 发起请求

以下示例展示了如何通过 curl 获取舞萌 DX 玩家信息。

#### 开发者 API 调用示例

```bash
curl -H "Authorization: 9sKKK47Ewi20OroB8mhr_0zOiHO3n7jwTaU9atcf2dc=" \
     https://maimai.lxns.net/api/v0/maimai/player/[好友码]
````

#### 个人 API 调用示例

```bash
curl -H "X-User-Token: KVV1nwdHG5LWl6Gm-5TNqhFukwjVCz4YxzBqgYiUkCM=" \
     https://maimai.lxns.net/api/v0/user/maimai/player
```

#### OAuth API 调用示例

参见 [OAuth 接入指南](/docs/oauth-guide)。

### 3. 响应示例

```json
{
    "success": true,
    "code": 200,
    "data": {
        "name": "理论值",
        "rating": 16412,
        "friend_code": 888888888888888,
        "course_rank": 23,
        "class_rank": 25,
        "star": 0,
        "trophy": {
            "id": -1,
            "name": "理论值",
            "genre": "",
            "color": "Rainbow"
        },
        "icon": {
            "id": 1,
            "name": "",
            "genre": ""
        },
        "upload_time": "2025-08-17T13:54:36Z"
    }
}
```

## 鉴权方式

所有 API 的基础 URL 均为：

```
https://maimai.lxns.net/api/v0/
```

我们提供了三种 API 鉴权方式，分别适用于不同的使用场景：

| 功能       | 开发者 API | 个人 API  | OAuth API |
|----------|-|---------|-----------|
| 访问所有玩家数据 | ✔️ | ❌       | ❌         |
| 访问授权玩家数据 | ✔️ | ✔️      | ✔️        |
| 访问查分器前端接口 | ❌ | ✔️（仅玩家） | ✔️（仅授权接口） |
| 访问授权用户数据 | ❌ | ❌       | ✔️        |

::: info 提示
我们特别推荐需要访问玩家所有成绩的开发者使用 **OAuth API**，开发者 API 没有权限访问玩家的所有完整成绩。
:::

::: warning 注意
个人 API 密钥不能用于开发者 API，开发者 API 密钥不能用于个人 API，请提前根据需求使用对应的 API 密钥。
:::

### 开发者 API

该 API 适合使用好友码访问玩家数据的开发者使用。

所有请求均需要在请求头加入**开发者 API 密钥**，如果没有，请[申请成为开发者](/developer/apply)获取。

#### 请求头示例

```
Authorization: 9sKKK47Ewi20OroB8mhr_0zOiHO3n7jwTaU9atcf2dc=
```

### 个人 API

该 API 适合有需求使用查分器前端的玩家 API 访问自己或授权玩家的游戏数据。

所有请求均需要在请求头加入**个人 API 密钥**，如果没有，请前往[账号详情](/user/profile)生成。

#### 请求头示例

```
X-User-Token: KVV1nwdHG5LWl6Gm-5TNqhFukwjVCz4YxzBqgYiUkCM=
```

### OAuth API

参见 [OAuth 接入指南](/docs/oauth-guide)。

## 响应结构

上述 API 的结果将会以 JSON 格式响应：

| 字段名 | 类型 | 说明 |
|-|-|-|
| `success` | `bool` | 请求是否成功处理 |
| `code` | `int` | HTTP 状态码，通常为 `200` |
| `message` | `string` | 值可空，请求失败理由 |
| `data` | `dict` 或 `list` | 值可空，请求结果 |

## 错误码说明

当请求失败时，API 会返回 HTTP 状态码，并在响应体中给出错误信息。

### 常见错误码

| 错误码 | 含义 | 说明 |
|-|-|-|
| 400 | Bad Request | 请求参数错误或缺失 |
| 401 | Unauthorized | 鉴权失败，可能是密钥错误或过期 |
| 403 | Forbidden | 权限不足，可能是访问了未授权的资源 |
| 404 | Not Found | 请求的资源不存在 |
| 429 | Too Many Requests | 请求过于频繁，触发了速率限制 |
| 500 | Internal Server Error | 服务器内部错误，请稍后重试 |

### 错误响应示例

```json
{
    "success": false,
    "code": 400,
    "message": "invalid friend code"
}
```

## 附录

API 返回的所有时间**均为 UTC 时间**，其格式形似 `2024-01-01T00:00:00Z`，代表北京时间上午 8 时。

如果你在开发过程中遇到任何问题，欢迎[联系我们](/docs/about#联系我们)寻求帮助。