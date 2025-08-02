# OAuth 接入指南

---

欢迎来到[落雪咖啡屋 maimai DX 查分器](/)的 OAuth 接入指南！

在这里，你将了解如何使用 OAuth 2.0 协议获取用户授权，并通过 API 接口访问用户的游戏数据等信息。

## 介绍

本查分器推出 OAuth 旨在替代个人 API 密钥，提供更安全、灵活的方式供开发者访问用户数据。

个人 API 密钥虽然可以访问用户数据，但是存在安全隐患：如果密钥泄露，其他人可以随意访问用户数据。而 OAuth 则提供了更细粒度的权限控制和更安全的授权流程。

开发者可以通过 OAuth 获取访问令牌（Access Token），并使用此令牌访问用户的游戏数据。用户可以随时撤销授权，确保数据安全。

## 接入步骤

接入前，请确保你已经申请并成为了开发者。申请时使用的开发者信息将会在 OAuth 授权页面中展示。

### 1. 创建应用

前往[开发者面板](/developer)创建一个新的 OAuth 应用。你需要提供以下信息：

- **应用名称**：你的应用名称，将在授权页面中显示。
- **应用描述**（可选）：简要描述你的应用功能。
- **应用图标**（可选）：上传一个应用图标，将在授权页面中显示。
- **回调地址**：OAuth 授权成功后，用户将被重定向到此 URL。请确保你的应用能够处理此 URL。
- **应用权限**：选择你的应用需要的权限范围，如读取玩家数据、写入玩家数据等。

::: info 提示
如果你没有回调地址，你可以勾选“无回调地址”，这将在授权成功后直接返回授权码，而不是重定向到回调地址。
:::

### 2. 获取 OAuth 授权链接

创建应用后，你将获得一个 OAuth 授权链接。用户可以通过此链接授权你的应用访问其游戏数据。

链接格式如下：

```
https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=[应用 ID]&redirect_uri=[回调地址]&scope=[应用权限]
```

::: info 提示
你可以直接将此链接嵌入到你的应用中，或者通过其他方式分享给用户。如果你想区分不同用户或应用，你可以在链接中添加 `state` 参数来携带额外信息。
:::

### 3. 用户授权

用户点击授权链接后，将被重定向到授权页面。在此页面，用户登录查分器账号后可以查看你的应用信息，并选择是否授权。

如果用户同意授权，将会被重定向到你提供的回调地址，并附带一个授权码。如果无回调地址，则会直接显示授权码（形如 `JVJ6-VPTM-MGHZ`）。

### 4. 使用授权码获取访问令牌

在你的回调地址处理授权码后，你需要使用此授权码向 OAuth 服务器请求访问令牌。你可以使用以下 API 端点：

```
POST /api/v0/oauth/token
```

::: info 提示
请求头的 `Content-Type` 可以为 `application/json` 或 `application/x-www-form-urlencoded`。如果使用 JSON 格式，请确保将请求体转换为 JSON 字符串。
:::

#### 请求参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `client_id` | string | 应用 ID |
| `client_secret` | string | 应用密钥 |
| `grant_type` | string | 授权类型，固定为 `authorization_code` |
| `code` | string | 从回调地址获取的授权码 |
| `redirect_uri` | string | 回调地址，必须与创建应用时一致 |

#### 请求示例

```json
{
    "client_id": "e07f2ae3-795b-4368-b55f-5f27b0b3eae0",
    "client_secret": "fUluk5OJQ6OF8PGqGxs3TJ2zdZpwgDTs",
    "grant_type": "authorization_code",
    "code": "Oze6RZ0nPKy4JSmpI2aYxEIUmhl0l5fU",
    "redirect_uri": "http://localhost:5000/callback"
}
```

#### 响应体

| 字段名 | 类型 | 说明 |
|-|-|-|
| `access_token` | string | 访问令牌，用于访问用户数据 |
| `token_type` | string | 令牌类型，通常为 `Bearer` |
| `expires_in` | integer | 访问令牌的有效期，单位为秒 |
| `refresh_token` | string | 刷新令牌，用于获取新的访问令牌 |
| `scope` | string | 授权范围，表示应用可以访问的权限 |

::: info 提示
访问令牌为 JWT 格式，你可以解码以获取更多信息。
:::

::: warning 注意
访问令牌有效期为 15 分钟，过期后需使用刷新令牌重新获取。系统将返回新的访问令牌，同时刷新令牌保持有效（除非手动撤销或超过 30 天有效期）。请确保安全存储刷新令牌，以便持续获取新的访问令牌。
:::

::: warning 注意
刷新令牌有效期为 30 天。每次使用刷新令牌获取新的访问令牌时，系统将同时颁发一个新的刷新令牌，**旧令牌自动失效**。
:::

#### 响应示例

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "refresh_token": "SjiF1mnYY0qa1PEJhjeyDQPGPcBjWOKu",
    "scope": "read_player write_player"
}
```

### 5. 使用访问令牌访问 API

使用获取到的访问令牌，你可以访问用户的游戏数据。你需要在请求头中添加 `Authorization` 字段，格式为 `Bearer [access_token]`。

例如，获取用户的舞萌 DX 游戏数据：

```
GET /api/v0/user/maimai/player
```

其他接口可以参考 [OAuth API 文档](/docs/api/oauth)。

### 6. 刷新访问令牌

如果访问令牌过期，你可以使用刷新令牌获取新的访问令牌。你需要向以下端点发送请求：

```
POST /api/v0/oauth/token
```

#### 请求参数

| 参数名 | 类型 | 说明 |
|-|-|-|
| `client_id` | string | 应用 ID |
| `client_secret` | string | 应用密钥 |
| `grant_type` | string | 授权类型，固定为 `refresh_token` |
| `refresh_token` | string | 从上一步获取的刷新令牌 |

#### 请求示例

```json
{
    "client_id": "e07f2ae3-795b-4368-b55f-5f27b0b3eae0",
    "client_secret": "fUluk5OJQ6OF8PGqGxs3TJ2zdZpwgDTs",
    "grant_type": "refresh_token",
    "refresh_token": "SjiF1mnYY0qa1PEJhjeyDQPGPcBjWOKu"
}
```

#### 响应体

响应体与获取访问令牌时相同，将包含新的访问令牌和刷新令牌。

## 示例代码（Python）

以下是一个使用 Python 的示例代码，演示如何获取访问令牌并访问用户的游戏数据：

```python
from flask import Flask, request
import requests
import urllib.parse

app = Flask(__name__)

# 应用信息
CLIENT_ID = "e07f2ae3-795b-4368-b55f-5f27b0b3eae0"
CLIENT_SECRET = "fUluk5OJQ6OF8PGqGxs3TJ2zdZpwgDTs"
REDIRECT_URI = "http://localhost:5000/callback"

# OAuth 接口地址
AUTHORIZE_URL = "https://maimai.lxns.net/oauth/authorize"
TOKEN_URL = "https://maimai.lxns.net/api/v0/oauth/token"
PLAYER_API_URL = "https://maimai.lxns.net/api/v0/user/maimai/player"

@app.route("/")
def home():
    scope = ["read_player"]
    query = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(scope),
        "state": "test"  # 可选，如果不需要可以注释掉这一行
    }
    url = f"{AUTHORIZE_URL}?{urllib.parse.urlencode(query)}"
    return f'<a href="{url}">点击授权</a>'

@app.route("/callback")
def callback():
    code = request.args.get("code")
    if not code:
        return "授权失败，未获取到授权码", 400

    # 获取访问码
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI
    })
    token = resp.json()["data"]["access_token"]

    # 调用 API
    player = requests.get(PLAYER_API_URL, headers={
        "Authorization": f"Bearer {token}"
    }).json()

    return player

if __name__ == "__main__":
    app.run()
```