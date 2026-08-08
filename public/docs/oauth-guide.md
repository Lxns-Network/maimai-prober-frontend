# OAuth 接入指南

---

欢迎来到[落雪咖啡屋 maimai DX 查分器](/)的 OAuth 接入指南！

在这里，你将了解如何使用 OAuth 2.0 获取用户授权、调用查分器 API，以及通过 OpenID Connect（OIDC）完成用户登录和身份识别。

::: warning 注意
该功能目前处于测试阶段，部分功能可能会有所变动。
:::

## 介绍

本查分器推出 OAuth 旨在替代个人 API 密钥，提供更安全、灵活的方式供开发者访问用户数据。

个人 API 密钥虽然可以访问用户数据，但是存在安全隐患：如果密钥泄露，其他人可以随意访问用户数据。而 OAuth 则提供了更细粒度的权限控制和更安全的授权流程。

开发者可以通过 OAuth 获取访问令牌（Access Token），并使用此令牌访问用户授权的数据。需要登录能力时，还可以请求 OIDC 权限并获取 ID Token，以安全地识别当前用户。用户可以随时撤销授权，确保数据安全。

## 接入步骤

接入前，请确保你已经申请并成为了开发者。申请时使用的开发者信息将会在 OAuth 授权页面中展示。

### 1. 创建应用

前往[开发者面板](/developer)创建一个新的 OAuth 应用。你需要提供以下信息：

- **应用名称**：你的应用名称，将在授权页面中显示。
- **应用网站**（可选）：应用主页地址。
- **应用描述**（可选）：简要描述你的应用功能。
- **应用图标**（可选）：上传一个应用图标，将在授权页面中显示。
- **回调地址**：授权完成后用户将被重定向到请求指定的地址。每个应用最多可以登记 10 个回调地址。
- **应用权限范围**：根据用途选择 API 授权或 OpenID Connect 身份认证所需的权限。

::: info 动态客户端
MCP 等无需预先创建应用的公共客户端可以调用 [`POST /api/v0/oauth/register`](/docs/api/oauth#post-apiv0oauthregister) 动态注册。动态客户端不需要开发者账号或应用密钥，但授权时必须使用 `S256` PKCE。
:::

授权请求中的 `redirect_uri` 必须与已登记的某个回调地址完全一致。预先创建的应用中，Web 应用应使用 HTTPS；本地开发可以使用 `localhost`、`127.0.0.1` 或 `[::1]` 的 HTTP 地址，移动端和桌面端应用也可以使用自定义协议地址。动态注册客户端仅支持 HTTPS 或上述回环地址的 HTTP 地址。

::: info 提示
如果应用没有回调地址，可以在开发者面板勾选“无回调地址”。用户授权后将会显示授权码，请将其复制到应用中。
:::

#### 权限范围

应用权限分为两组：

| 分组       | 权限                | 用途                                                                          |
| ---------- | ------------------- | ----------------------------------------------------------------------------- |
| API 授权   | `read_user_profile` | 读取用户信息：包括你的用户名、邮箱等基本信息。                                |
| API 授权   | `read_player`       | 读取玩家数据：包括你的玩家信息、谱面成绩、历史成绩等信息。                    |
| API 授权   | `write_player`      | 写入玩家数据：包括更新你的玩家信息、上传成绩、删除成绩等操作。                |
| API 授权   | `read_user_token`   | 读取个人 API 密钥；该密钥对已绑定的游戏数据拥有完全访问权限，不再推荐使用。   |
| 登录与身份 | `openid`            | 验证用户身份：允许应用确认当前登录的是你，并获取用于识别你的唯一标识。        |
| 登录与身份 | `profile`           | 读取基本资料：允许应用获取你的查分器用户名等基本资料；必须同时申请 `openid`。 |
| 登录与身份 | `email`             | 读取邮箱地址：允许应用获取你在查分器中绑定的邮箱地址；必须同时申请 `openid`。 |

::: info 如何选择
如果应用需要调用查分器 API，请申请对应的 API 权限；如果应用只需要“使用查分器账号登录”，请申请 `openid`，并按需添加 `profile` 或 `email`。同时需要登录和访问 API 时，可以组合申请两组权限。
:::

### 2. 获取 OAuth 授权链接

创建应用后，你将获得一个 OAuth 授权链接。用户可以通过此链接授权你的应用访问其游戏数据。

链接格式如下：

```
https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=[应用 ID]&redirect_uri=[回调地址]&scope=[权限范围]
```

常用参数如下：

| 参数名                  | 必填             | 说明                                                                       |
| ----------------------- | ---------------- | -------------------------------------------------------------------------- |
| `response_type`         | 是               | 固定为 `code`                                                              |
| `client_id`             | 是               | 创建应用后获得的应用 ID                                                    |
| `redirect_uri`          | 是               | 本次授权使用的回调地址，必须与已登记地址完全一致                           |
| `scope`                 | 是               | 以空格分隔的权限列表                                                       |
| `state`                 | 推荐             | 用于关联请求和回调，并防止跨站请求伪造                                     |
| `nonce`                 | OIDC 推荐        | 绑定授权请求和 ID Token，防止重放攻击；最长 255 个字符                     |
| `code_challenge`        | 使用 PKCE 时必填 | 由 `code_verifier` 计算得到的挑战值                                        |
| `code_challenge_method` | 使用 PKCE 时必填 | 推荐使用 `S256`；普通客户端也可使用 `plain`，动态注册客户端必须使用 `S256` |

仅调用查分器 API 的示例：

```
https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=[应用 ID]&redirect_uri=[回调地址]&scope=read_player&state=[随机值]
```

使用查分器账号登录的示例：

```
https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=[应用 ID]&redirect_uri=[回调地址]&scope=openid%20profile%20email&state=[随机值]&nonce=[随机值]
```

::: info 提示
你可以直接将此链接嵌入到你的应用中，或者通过其他方式分享给用户。建议为每次授权生成随机 `state`，将它与当前用户会话关联，并在回调时进行校验。
:::

::: info 提示
如果你是公共客户端，无法存储并使用 `client_secret`，可以使用 [PKCE](#pkce)（Proof Key for Code Exchange） 来增强安全性。
:::

### 3. 用户授权

用户点击授权链接后，将被重定向到授权页面。在此页面，用户登录查分器账号后可以查看你的应用信息，并选择是否授权。

如果用户同意授权，通常会被重定向到本次请求的回调地址，并附带一个授权码。使用开发者面板“无回调地址”选项生成的授权链接时，授权码会直接显示在授权页面中（形如 `JVJ6-VPTM-MGHZ`）。回调中的 `state` 应与授权请求中发送的值完全一致。

### 4. 使用授权码获取访问令牌

在你的回调地址处理授权码后，你需要使用此授权码向 OAuth 服务器请求访问令牌。你可以使用以下 API 端点：

```
POST /api/v0/oauth/token
```

::: info 提示
请求头的 `Content-Type` 可以为 `application/json` 或 `application/x-www-form-urlencoded`。如果使用 JSON 格式，请确保将请求体转换为 JSON 字符串。
:::

#### 请求参数

参见[访问令牌请求方式](#访问令牌请求方式)。

#### 响应体

| 字段名          | 类型    | 说明                                            |
| --------------- | ------- | ----------------------------------------------- |
| `access_token`  | string  | 访问令牌，用于访问用户数据                      |
| `token_type`    | string  | 令牌类型，通常为 `Bearer`                       |
| `expires_in`    | integer | 访问令牌的有效期，单位为秒                      |
| `refresh_token` | string  | 刷新令牌，用于获取新的访问令牌                  |
| `scope`         | string  | 授权范围，表示应用可以访问的权限                |
| `id_token`      | string  | OIDC ID Token，仅在授权范围包含 `openid` 时返回 |

::: danger 破坏性变更
访问令牌响应的字段现已位于响应**顶层**（符合 OAuth 2.0 标准）。为兼容旧版集成，`data` 包装（即 `data.access_token`）暂时保留，但**已废弃，并将在未来版本中移除**。请尽快改为从响应顶层直接读取 `access_token` 等字段。
:::

::: info 提示
访问令牌为 JWT 格式，你可以解码以获取更多信息。
:::

::: warning 注意
访问令牌有效期为 15 分钟，过期后需使用刷新令牌重新获取。请安全存储刷新令牌。
:::

#### 响应示例

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "SjiF1mnYY0qa1PEJhjeyDQPGPcBjWOKu",
  "scope": "openid profile email",
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Im1haW1haS1wcm9iZXItb2lkYy0xIn0..."
}
```

#### 错误响应

如果请求参数无效、授权码过期或其他错误，服务器将返回一个错误响应，包含 `error` 和 `error_description` 字段。例如：

```json
{
  "error": "invalid_grant",
  "error_description": "authorization code expired"
}
```

`error` 取值如下：

| `error`                  | 说明                                                     |
| ------------------------ | -------------------------------------------------------- |
| `invalid_request`        | 缺少必需参数、参数无效或请求格式错误                     |
| `invalid_client`         | 客户端不存在，或客户端认证（`client_secret`）失败        |
| `invalid_grant`          | 授权码或刷新令牌无效、已过期，或与客户端、回调地址不匹配 |
| `unsupported_grant_type` | 不支持的 `grant_type`                                    |
| `server_error`           | 服务器内部错误                                           |

::: warning 注意
错误响应为标准扁平格式，**不包含** `success`、`code`、`data` 字段；该格式同时适用于刷新令牌等所有令牌接口请求。
:::

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

::: warning 注意
刷新令牌有效期为 30 天。每次使用刷新令牌获取新的访问令牌时，系统将同时颁发一个新的刷新令牌，**旧令牌自动失效**。
:::

#### 请求参数

| 参数名          | 类型   | 说明                             |
| --------------- | ------ | -------------------------------- |
| `client_id`     | string | 应用 ID                          |
| `client_secret` | string | 应用密钥，PKCE 不需要此参数      |
| `grant_type`    | string | 授权类型，固定为 `refresh_token` |
| `refresh_token` | string | 从上一步获取的刷新令牌           |

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

授权范围包含 `openid` 时，刷新令牌响应也会包含新的 `id_token`。刷新流程生成的 ID Token 不包含初次授权请求中的 `nonce`。

## 使用 OpenID Connect

OIDC 使用与 OAuth 相同的授权码流程。客户端无需硬编码各个端点，可以从发现文档读取服务端元数据：

```
GET https://maimai.lxns.net/.well-known/openid-configuration
```

发现文档包含 `issuer`、`authorization_endpoint`、`token_endpoint`、`userinfo_endpoint` 和 `jwks_uri` 等字段。OAuth 授权服务器元数据也可以从以下地址获取：

```
GET https://maimai.lxns.net/.well-known/oauth-authorization-server
```

### 验证 ID Token

ID Token 使用 RS256 签名。客户端应根据发现文档中的 `jwks_uri` 获取公钥，并至少完成以下校验：

1. 使用 JWKS 中与 Token `kid` 对应的公钥验证签名和 `RS256` 算法。
2. 确认 `iss` 与发现文档中的 `issuer` 完全一致。
3. 确认 `aud` 包含当前应用的 `client_id`。
4. 确认 `exp` 尚未过期。
5. 如果授权请求发送了 `nonce`，确认 Token 中的 `nonce` 与请求值一致。

`sub` 是当前用户在查分器中的稳定标识，客户端应使用 `iss` 与 `sub` 的组合作为外部账号标识，不要使用用户名或邮箱作为唯一标识。

### 获取用户信息

授权范围包含 `openid` 时，可以使用访问令牌调用 UserInfo 端点：

```
GET https://maimai.lxns.net/api/v0/oauth/userinfo
Authorization: Bearer [access_token]
```

响应中的声明由已授权权限决定：

| 权限      | 返回的声明                   |
| --------- | ---------------------------- |
| `openid`  | `sub`                        |
| `profile` | `name`、`preferred_username` |
| `email`   | `email`、`email_verified`    |

响应示例：

```json
{
  "sub": "12345",
  "name": "example-user",
  "preferred_username": "example-user",
  "email": "user@example.com",
  "email_verified": true
}
```

`email_verified` 会反映用户当前绑定邮箱的实际验证状态。用户尚未验证邮箱时，该字段为 `false`。

::: warning 注意
UserInfo 端点要求访问令牌包含 `openid`。`profile` 和 `email` 仅控制相应声明是否返回，不能单独申请。
:::

## 访问令牌请求方式

获取访问令牌有两种方式：**应用密钥**和**PKCE**（Proof Key for Code Exchange）。这两种方式适用于不同类型的客户端。

你可以选择其中一种方式来获取访问令牌，也可以根据你的应用类型和安全需求结合使用。

### 应用密钥

如果你的应用是机密客户端（如服务器端应用），你可以使用应用密钥认证来获取访问令牌。此方式需要在请求中提供 `client_secret`。

#### 请求参数

| 参数名          | 类型   | 说明                                         |
| --------------- | ------ | -------------------------------------------- |
| `client_id`     | string | 应用 ID                                      |
| `client_secret` | string | 应用密钥                                     |
| `grant_type`    | string | 授权类型，固定为 `authorization_code`        |
| `code`          | string | 从回调地址获取的授权码                       |
| `redirect_uri`  | string | 必须与授权请求及某个已登记的回调地址完全一致 |

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

#### 示例代码（Python）

以下是一个使用应用密钥获取访问令牌的示例代码，演示如何处理 OAuth 授权流程：

```python
from flask import Flask, request, session
import requests
import urllib.parse
import secrets

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)  # 示例用；生产环境请使用固定的安全密钥

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
    state = secrets.token_urlsafe(32)
    session["oauth_state"] = state
    query = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(scope),
        "state": state
    }
    url = f"{AUTHORIZE_URL}?{urllib.parse.urlencode(query)}"
    return f'<a href="{url}">点击授权</a>'

@app.route("/callback")
def callback():
    code = request.args.get("code")
    state = request.args.get("state")
    expected_state = session.pop("oauth_state", None)
    if not code or not state or state != expected_state:
        return "授权失败，授权状态无效", 400

    # 获取访问令牌
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI
    })
    token = resp.json()["access_token"]

    # 调用 API
    player = requests.get(PLAYER_API_URL, headers={
        "Authorization": f"Bearer {token}"
    }).json()

    return player

if __name__ == "__main__":
    app.run()
```

### PKCE

PKCE（Proof Key for Code Exchange）是一种增强 OAuth 2.0 安全性的机制，特别适用于公共客户端（如移动应用、单页应用等），可以防止授权码被截获和重放攻击。

PKCE 通过在授权请求中添加一个随机生成的 `code_verifier` 和 `code_challenge` 来实现。以下是 PKCE 的基本流程：

1. **生成 Code Verifier**：客户端生成一个随机字符串，称为 `code_verifier`。
2. **生成 Code Challenge**：客户端使用 `code_verifier` 生成一个 `code_challenge`，通常是通过 SHA-256 哈希算法。
3. **发送授权请求**：在授权请求中，客户端将 `code_challenge` 和 `code_challenge_method`（通常为 `S256`）作为参数发送。
4. **获取授权码**：用户授权后，服务器将 `code` 返回给客户端。
5. **交换访问令牌**：客户端使用 `code_verifier` 和 `code` 向服务器请求访问令牌。

#### 请求参数

| 参数名          | 类型   | 说明                                         |
| --------------- | ------ | -------------------------------------------- |
| `client_id`     | string | 应用 ID                                      |
| `grant_type`    | string | 授权类型，固定为 `authorization_code`        |
| `code`          | string | 从回调地址获取的授权码                       |
| `redirect_uri`  | string | 必须与授权请求及某个已登记的回调地址完全一致 |
| `code_verifier` | string | PKCE 验证码                                  |

#### 请求示例

```json
{
  "client_id": "e07f2ae3-795b-4368-b55f-5f27b0b3eae0",
  "grant_type": "authorization_code",
  "code": "Oze6RZ0nPKy4JSmpI2aYxEIUmhl0l5fU",
  "redirect_uri": "http://localhost:5000/callback",
  "code_verifier": "randomly_generated_code_verifier"
}
```

#### 示例代码（Python）

以下是一个使用 PKCE 的示例代码，演示如何生成 `code_verifier` 和 `code_challenge`，并在授权请求中使用它们：

::: warning 注意
`code_verifier` 必须保留在客户端，不要放入 `state` 或授权 URL。示例将它与随机 `state` 一起保存在会话中。
:::

```python
from flask import Flask, request, session
import requests
import urllib.parse
import secrets
import hashlib
import base64

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)  # 示例用；生产环境请使用固定的安全密钥

# 应用信息（公共客户端，无 secret）
CLIENT_ID = "e07f2ae3-795b-4368-b55f-5f27b0b3eae0"
REDIRECT_URI = "http://localhost:5000/callback"

# OAuth 接口地址
AUTHORIZE_URL = "https://maimai.lxns.net/oauth/authorize"
TOKEN_URL = "https://maimai.lxns.net/api/v0/oauth/token"
PLAYER_API_URL = "https://maimai.lxns.net/api/v0/user/maimai/player"

# 生成 code_verifier 和 code_challenge
def generate_code_verifier():
    return secrets.token_urlsafe(64)

def generate_code_challenge(verifier):
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()

@app.route("/")
def home():
    scope = ["read_player"]

    # 生成随机 code_verifier
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)
    state = secrets.token_urlsafe(32)
    session["oauth_state"] = state
    session["code_verifier"] = code_verifier

    query = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(scope),
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state
    }
    url = f"{AUTHORIZE_URL}?{urllib.parse.urlencode(query)}"
    return f'<a href="{url}">点击授权</a>'

@app.route("/callback")
def callback():
    code = request.args.get("code")
    state = request.args.get("state")
    expected_state = session.pop("oauth_state", None)
    code_verifier = session.pop("code_verifier", None)
    if not code or not state or state != expected_state or not code_verifier:
        return "授权失败，授权状态无效", 400

    # 用 code_verifier 换 token
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier
    })
    token_data = resp.json()
    access_token = token_data["access_token"]

    # 调用 API
    player = requests.get(PLAYER_API_URL, headers={
        "Authorization": f"Bearer {access_token}"
    }).json()

    return player

if __name__ == "__main__":
    app.run()
```
