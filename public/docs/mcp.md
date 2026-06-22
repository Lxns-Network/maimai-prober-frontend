# 使用 MCP 服务器

---

[落雪咖啡屋 maimai DX 查分器](/)提供了 MCP 服务器，支持 MCP（Model Context Protocol）的 AI 客户端可以经 OAuth 授权访问你的游戏数据，代你查询曲目、读取成绩、导入成绩以及计算单曲 Rating。

::: warning 注意
该功能目前处于测试阶段，部分功能可能会有所变动。
:::

## 介绍

MCP（Model Context Protocol，模型上下文协议）是一套开放标准，让 AI 客户端能够以统一的方式调用外部工具与数据源。

本查分器提供了一个远程 MCP 服务器，你可以在支持 MCP 的客户端（如 Claude 等）中接入它，让 AI 助手代你完成以下操作：

- 搜索曲目、查询单曲详情、解析曲目别名；
- 读取你的玩家资料、谱面成绩与游玩历史；
- 导入并保存你的成绩；
- 计算单曲的 DX Rating、Rating 与 OVER POWER。

服务器通过 OAuth 授权访问你的数据。你无需成为开发者，也无需提前创建应用，连接时按照客户端的提示在浏览器中完成授权即可。

## 服务器地址

MCP 服务器使用 Streamable HTTP 传输，地址如下：

```
https://maimai.lxns.net/mcp
```

## 连接客户端

在支持远程 MCP 服务器的客户端中添加上述地址即可。首次连接时，客户端会自动打开浏览器，引导你登录查分器账号并确认授权范围，随后即可使用。

以 Claude Code 为例：

```bash
claude mcp add --transport http maimai-prober https://maimai.lxns.net/mcp
```

对于使用配置文件的客户端，通常按如下方式声明：

```json
{
  "mcpServers": {
    "maimai-prober": {
      "type": "http",
      "url": "https://maimai.lxns.net/mcp"
    }
  }
}
```

::: info 提示
访问令牌有效期为 15 分钟，刷新令牌有效期为 30 天。客户端会在令牌过期时自动刷新，通常无需重新授权。
:::

## 授权与权限

首次连接时，你将被重定向到授权页面。在确认授权前，请确保你已登录查分器账号，并仔细核对客户端请求的权限范围。

各权限范围及其对应的工具如下：

| 权限范围            | 说明                                                       | 对应工具                                                                         |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `read_user_profile` | 读取用户信息，包括你的用户名、邮箱等账号资料。             | `get_my_profile`                                                                 |
| `read_player`       | 读取玩家数据，包括你的玩家信息、谱面成绩、历史成绩等信息。 | `get_my_*_player`、`get_my_*_scores`、`get_my_*_score`、`get_my_*_score_history` |
| `write_player`      | 写入玩家数据，包括更新你的玩家信息、上传成绩等操作。       | `import_my_*_scores`                                                             |

::: warning 注意
`write_player` 为高风险权限。授予后，客户端可以代你导入并更新成绩，请仅授权给你信任的客户端。
:::

你可以随时在个人资料的「第三方应用」中查看并撤销已授权的应用。撤销后，对应的访问令牌与刷新令牌将立即失效。

## 工具列表

所有工具都需要有效的访问令牌。标记为**公开**的工具不要求特定权限范围，但仍需完成授权登录。

### 通用

| 工具             | 说明                                               | 所需权限            |
| ---------------- | -------------------------------------------------- | ------------------- |
| `get_my_profile` | 获取你的账号资料（账号名、邮箱、权限、注册时间）。 | `read_user_profile` |

### 舞萌 DX

| 工具                          | 说明                                             | 所需权限       |
| ----------------------------- | ------------------------------------------------ | -------------- |
| `search_maimai_songs`         | 按曲名子串搜索舞萌 DX 曲目库。                   | 公开           |
| `get_maimai_song`             | 按曲目 ID 获取舞萌 DX 单曲详情。                 | 公开           |
| `resolve_maimai_alias`        | 将别名解析为对应的舞萌 DX 曲目。                 | 公开           |
| `calculate_maimai_rating`     | 计算单曲舞萌 DX Rating（输入谱面定数与达成率）。 | 公开           |
| `get_my_maimai_player`        | 获取你的舞萌 DX 玩家资料（DX Rating、名称等）。  | `read_player`  |
| `get_my_maimai_scores`        | 获取你的全部舞萌 DX 成绩（每个谱面的最佳成绩）。 | `read_player`  |
| `get_my_maimai_score`         | 获取你单个舞萌 DX 谱面的最佳成绩。               | `read_player`  |
| `get_my_maimai_score_history` | 获取你单个舞萌 DX 谱面的游玩历史。               | `read_player`  |
| `import_my_maimai_scores`     | 导入/保存你的舞萌 DX 成绩（写操作）。            | `write_player` |

### 中二节奏

| 工具                            | 说明                                                                                | 所需权限       |
| ------------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| `search_chunithm_songs`         | 按曲名子串搜索中二节奏曲目库。                                                      | 公开           |
| `get_chunithm_song`             | 按曲目 ID 获取中二节奏单曲详情。                                                    | 公开           |
| `resolve_chunithm_alias`        | 将别名解析为对应的中二节奏曲目。                                                    | 公开           |
| `calculate_chunithm_rating`     | 计算单曲中二节奏 Rating 与 OVER POWER（输入谱面定数、分数，可选 FULL COMBO 类型）。 | 公开           |
| `get_my_chunithm_player`        | 获取你的中二节奏玩家资料（Rating、名称等）。                                        | `read_player`  |
| `get_my_chunithm_scores`        | 获取你的全部中二节奏成绩（每个谱面的最佳成绩）。                                    | `read_player`  |
| `get_my_chunithm_score`         | 获取你单个中二节奏谱面的最佳成绩。                                                  | `read_player`  |
| `get_my_chunithm_score_history` | 获取你单个中二节奏谱面的游玩历史。                                                  | `read_player`  |
| `import_my_chunithm_scores`     | 导入/保存你的中二节奏成绩（写操作）。                                               | `write_player` |
