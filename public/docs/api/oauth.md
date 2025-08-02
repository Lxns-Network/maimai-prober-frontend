# OAuth API 文档

---

该文档的所有请求均需要在请求头加入 **OAuth 生成的访问密钥**，请参考 [OAuth 接入指南](/docs/oauth-guide)获取详细信息。

请求头示例：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

API 返回的所有时间**均为 UTC 时间**，其格式形似 `2024-01-01T00:00:00Z`，代表北京时间上午 8 时。

## 用户 API

### 响应结构

结果将会以 JSON 格式响应：

| 字段名 | 类型 | 说明 |
|-|-|-|
| `success` | `bool` | 请求是否成功处理 |
| `code` | `int` | HTTP 状态码，通常为 `200` |
| `message` | `string` | 值可空，请求失败理由 |
| `data` | `dict` 或 `list` | 值可空，请求结果 |

### GET `/api/v0/user/profile`

获取用户的基本信息。

#### 权限

- `read_user_profile`

### GET `/api/v0/user/token`

获取用户的个人 API 密钥。

#### 权限

- `read_user_token`

## 舞萌 DX API

参考[舞萌 DX API 文档](/docs/api/maimai#个人-api)获取详细信息。

## 中二节奏 API

参考[中二节奏 API 文档](/docs/api/chunithm#个人-api)获取详细信息。