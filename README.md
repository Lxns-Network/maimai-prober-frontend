<h1>
  <img width="200" src="./public/favicon.webp" alt="logo" align="right">
maimai DX 查分器
</h1>

![](https://img.shields.io/uptimerobot/ratio/m796711561-69ba3b113942c693fdde2db8)
![](https://img.shields.io/github/last-commit/Lxns-Network/maimai-prober-frontend?color=blue)
![](https://img.shields.io/codacy/grade/81bf94766124465aa512c883b2d6a9b5)
![](https://img.shields.io/discord/815106295614144512)

一个简单的舞萌 DX & 中二节奏国服查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。

该项目为查分器的前端部分，使用 React + TypeScript + Vite 编写。

了解查分器的使用方法，请参见：[官方文档](https://maimai.lxns.net/docs)

## 特性

- 📱 支持「舞萌 DX」与「中二节奏」的游戏数据同步
- 💻 不受设备限制，支持多平台同步、管理游戏数据
- 🚀 快速的游戏数据同步体验
- 🤩 易于使用的成绩、曲目与姓名框查询功能
- ⚖️ 独立的曲目别名系统，支持提交和投票
- 🌐 开放的 API 接口，支持第三方开发者对接
- 🌈 支持暗色与自动主题

## 调试

使用 `.node-version` 指定的 Node.js 24 和项目固定的 Yarn 版本：

```bash
corepack enable
yarn install --immutable
yarn dev
```

## 检查

```bash
yarn typecheck
yarn test
yarn lint
yarn stylelint
yarn format:check
```

Oxlint 检查 TypeScript/JavaScript 代码，Oxfmt 检查格式，Stylelint 检查 CSS。测试使用模拟网络与存储，不需要真实账号或后端。

## 构建

```bash
yarn build
```

Sentry 上传由发布工作流通过 `SENTRY_UPLOAD=1` 和 `SENTRY_AUTH_TOKEN` 启用。
