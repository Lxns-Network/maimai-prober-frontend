# OAuth API 文档

---

用户 API 和 UserInfo 请求需要在请求头加入 **OAuth 生成的访问令牌**，请参考 [OAuth 接入指南](/docs/oauth-guide)获取详细信息。令牌、动态客户端注册和发现文档端点不需要访问令牌。

本文档中的 `read_user_profile`、`read_player`、`write_player` 和 `read_user_token` 都是用于调用查分器 API 的 OAuth 权限。`openid`、`profile` 和 `email` 属于 OpenID Connect 身份认证权限，不会单独授予下列 API 的访问能力；需要同时登录用户并调用 API 时，请组合申请对应权限。

请求头示例：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

API 返回的所有时间**均为 UTC 时间**，其格式形似 `2024-01-01T00:00:00Z`，代表北京时间上午 8 时。

## OAuth 2.0 / OpenID Connect 端点

### POST `/api/v0/oauth/token`

使用授权码或刷新令牌获取访问令牌。请求体支持 `application/json` 和 `application/x-www-form-urlencoded` 两种格式。

#### 授权码交换参数

| 参数名          | 类型     | 说明                                        |
| --------------- | -------- | ------------------------------------------- |
| `grant_type`    | `string` | 固定为 `authorization_code`                 |
| `client_id`     | `string` | 应用 ID                                     |
| `code`          | `string` | 授权页面返回的授权码                        |
| `redirect_uri`  | `string` | 必须与授权请求及已登记地址完全一致          |
| `client_secret` | `string` | 机密客户端的应用密钥；PKCE 客户端不需要     |
| `code_verifier` | `string` | PKCE 验证码；公共客户端和动态注册客户端使用 |

`client_secret` 和 `code_verifier` 至少提供一个。动态注册客户端必须在授权请求中使用 `S256` PKCE，并在此处提供 `code_verifier`。

#### 刷新令牌参数

| 参数名          | 类型     | 说明                              |
| --------------- | -------- | --------------------------------- |
| `grant_type`    | `string` | 固定为 `refresh_token`            |
| `client_id`     | `string` | 应用 ID                           |
| `refresh_token` | `string` | 上一次获取的刷新令牌              |
| `client_secret` | `string` | 机密客户端必填；PKCE 客户端不需要 |

#### 响应体

| 字段名          | 类型      | 说明                                     |
| --------------- | --------- | ---------------------------------------- |
| `access_token`  | `string`  | 访问令牌                                 |
| `token_type`    | `string`  | 令牌类型，通常为 `Bearer`                |
| `expires_in`    | `integer` | 访问令牌有效期，单位为秒                 |
| `refresh_token` | `string`  | 刷新令牌                                 |
| `scope`         | `string`  | 实际授予的权限，以空格分隔               |
| `id_token`      | `string`  | 包含 `openid` 权限时返回的 OIDC ID Token |

响应暂时同时保留旧版的 `success`、`code` 和 `data` 包装；新客户端应读取顶层字段。刷新令牌会轮换，旧令牌使用后失效。

错误响应使用标准扁平格式，不包含 `success`、`code` 或 `data`：

```json
{
  "error": "invalid_grant",
  "error_description": "invalid authorization code"
}
```

### POST `/api/v0/oauth/register`

按照 RFC 7591 动态注册公共 OAuth 客户端。

#### 请求体

```json
{
  "client_name": "Example Client",
  "redirect_uris": ["https://example.com/oauth/callback"],
  "scope": "read_player"
}
```

`client_name` 和 `scope` 可省略；默认客户端名称为 `MCP Client`，默认权限为 `read_user_profile read_player write_player`。`redirect_uris` 必须包含 1 至 10 个不重复的 URI，每个 URI 最长 2048 个字符，仅支持 HTTPS 或 `localhost`、`127.0.0.1`、`::1` 的 HTTP 地址。动态客户端不能申请 `read_user_token`，授权时必须使用 `S256` PKCE。

#### 响应体（201）

成功返回 `201`：

| 字段名                       | 类型       | 说明                                       |
| ---------------------------- | ---------- | ------------------------------------------ |
| `client_id`                  | `string`   | 新创建的应用 ID                            |
| `client_name`                | `string`   | 应用名称                                   |
| `redirect_uris`              | `string[]` | 已登记的回调地址                           |
| `scope`                      | `string`   | 实际授予的权限，以空格分隔                 |
| `token_endpoint_auth_method` | `string`   | 客户端认证方式，固定为 `none`              |
| `grant_types`                | `string[]` | 支持 `authorization_code`、`refresh_token` |
| `response_types`             | `string[]` | 支持 `code`                                |

### GET `/.well-known/openid-configuration`

获取 OpenID Connect Provider Metadata。

#### 响应体

| 字段名                                  | 类型       | 说明                                 |
| --------------------------------------- | ---------- | ------------------------------------ |
| `issuer`                                | `string`   | OIDC 服务端发行者                    |
| `authorization_endpoint`                | `string`   | 授权端点                             |
| `token_endpoint`                        | `string`   | 令牌端点                             |
| `userinfo_endpoint`                     | `string`   | UserInfo 端点                        |
| `jwks_uri`                              | `string`   | JWKS 公钥集合地址                    |
| `registration_endpoint`                 | `string`   | 动态客户端注册端点                   |
| `scopes_supported`                      | `string[]` | 支持的权限范围                       |
| `response_types_supported`              | `string[]` | 支持的响应类型，当前为 `code`        |
| `response_modes_supported`              | `string[]` | 支持的响应模式，当前为 `query`       |
| `grant_types_supported`                 | `string[]` | 支持的授权类型                       |
| `subject_types_supported`               | `string[]` | 支持的 subject 类型，当前为 `public` |
| `id_token_signing_alg_values_supported` | `string[]` | ID Token 签名算法，当前为 `RS256`    |
| `token_endpoint_auth_methods_supported` | `string[]` | 令牌端点认证方式                     |
| `code_challenge_methods_supported`      | `string[]` | 支持的 PKCE 方法，当前为 `S256`      |
| `claims_supported`                      | `string[]` | 支持的 OIDC 声明名称                 |

### GET `/.well-known/oauth-authorization-server`

获取 OAuth 2.0 Authorization Server Metadata。

#### 响应体

| 字段名                                  | 类型       | 说明                            |
| --------------------------------------- | ---------- | ------------------------------- |
| `issuer`                                | `string`   | OAuth 服务端发行者              |
| `authorization_endpoint`                | `string`   | 授权端点                        |
| `token_endpoint`                        | `string`   | 令牌端点                        |
| `registration_endpoint`                 | `string`   | 动态客户端注册端点              |
| `scopes_supported`                      | `string[]` | 支持的权限范围                  |
| `response_types_supported`              | `string[]` | 支持的响应类型，当前为 `code`   |
| `grant_types_supported`                 | `string[]` | 支持的授权类型                  |
| `code_challenge_methods_supported`      | `string[]` | 支持的 PKCE 方法，当前为 `S256` |
| `token_endpoint_auth_methods_supported` | `string[]` | 令牌端点认证方式                |

### GET `/.well-known/jwks.json`

获取用于验证 OIDC ID Token 的公钥集合。

#### 响应体

| 字段名 | 类型       | 说明                                                      |
| ------ | ---------- | --------------------------------------------------------- |
| `keys` | `object[]` | 公钥集合；每项包含 `kty`、`n`、`e`、`use`、`alg` 和 `kid` |

### GET `/.well-known/oauth-protected-resource/mcp`

获取 MCP 受保护资源元数据。

#### 响应体

| 字段名                     | 类型       | 说明                                 |
| -------------------------- | ---------- | ------------------------------------ |
| `resource`                 | `string`   | MCP 资源标识                         |
| `authorization_servers`    | `string[]` | 授权服务器发行者地址                 |
| `scopes_supported`         | `string[]` | 支持的权限范围                       |
| `bearer_methods_supported` | `string[]` | Bearer 令牌传输方式，当前为 `header` |

### GET/POST `/api/v0/oauth/userinfo`

使用包含 `openid` 权限的访问令牌获取当前用户的 OIDC 声明，返回标准 OIDC JSON。

#### 响应体

| 字段名               | 类型     | 说明                                |
| -------------------- | -------- | ----------------------------------- |
| `sub`                | `string` | 当前用户的稳定标识，始终返回        |
| `name`               | `string` | 申请 `profile` 时返回               |
| `preferred_username` | `string` | 申请 `profile` 时返回               |
| `email`              | `string` | 申请 `email` 时返回                 |
| `email_verified`     | `bool`   | 申请 `email` 时返回，邮箱是否已验证 |

## 用户 API

### 响应结构

结果将会以 JSON 格式响应：

| 字段名    | 类型             | 说明                      |
| --------- | ---------------- | ------------------------- |
| `success` | `bool`           | 请求是否成功处理          |
| `code`    | `int`            | HTTP 状态码，通常为 `200` |
| `message` | `string`         | 值可空，请求失败理由      |
| `data`    | `dict` 或 `list` | 值可空，请求结果          |

### GET `/api/v0/user/profile`

获取用户的基本信息。

#### 权限

- `read_user_profile`

#### 响应体

`data` 为用户信息对象：

| 字段名                | 类型     | 说明                        |
| --------------------- | -------- | --------------------------- |
| `id`                  | `int`    | 用户 ID                     |
| `name`                | `string` | 用户名                      |
| `email`               | `string` | 绑定的邮箱地址              |
| `email_verified`      | `bool`   | 邮箱是否已验证              |
| `email_verified_time` | `string` | 值可空，邮箱验证时间（UTC） |
| `permission`          | `int`    | 用户权限位掩码              |
| `register_time`       | `string` | 注册时间（UTC）             |

不会返回密码、个人 API 密钥或游戏配置。

### GET `/api/v0/user/token`

获取用户的个人 API 密钥；该密钥对已绑定的游戏数据拥有完全访问权限。

#### 权限

- `read_user_token`

#### 响应体

`data` 包含当前用户的个人 API 密钥：

| 字段名  | 类型     | 说明          |
| ------- | -------- | ------------- |
| `token` | `string` | 个人 API 密钥 |

## 舞萌 DX API

参考[舞萌 DX API 文档](/docs/api/maimai#个人-api)获取详细信息。

## 中二节奏 API

参考[中二节奏 API 文档](/docs/api/chunithm#个人-api)获取详细信息。
