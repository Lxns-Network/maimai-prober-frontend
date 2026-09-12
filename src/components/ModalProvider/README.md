# 跨页面可恢复弹窗

用于「弹窗 → 其他页面 → 返回原弹窗」。普通弹窗仍使用 `useBackDismiss`，不需要接入。

## 接入步骤

1. 用 `useOverlayNavigationStore.getState().openOverlay<Result>({ returnLabel, render, onClose })` 打开弹窗。
   `render` 是返回 React 元素的回调而不是组件，不能在其中调用 Hooks；业务数据由这个闭包持有，store 不存业务 DTO。
2. 弹窗组件内调用 `useResumableOverlay({ opened, onClose, getScrollViewport })`，
   把返回的 `linkProps` 展开到需要「跳走再回来」的原生 `<a>`（或 `Anchor`、`Avatar component="a"`）上，
   并在 `Modal` 的 `onEnterTransitionEnd` 调用 `restoreView`。
3. 目标页使用公共 `Page` 即可：`PageHeader` 会读取会话的 `returnLabel` 显示返回箭头，无会话时回退到页面自己的 `backLink`。

## 禁忌

- 弹窗必须 `keepMounted`，否则表单与展开状态会在隐藏期间丢失。
- `linkProps` 不能与项目的 `Link` 组件或另一个导航处理函数叠加，会重复跳转。
- `navigateFromOverlay` 表示离开并关闭弹窗、不保留返回会话，只用于不需要回来的跳转。
- 会话只存在于当前标签页内存中：刷新、新标签页或外部直接进入不会重建弹窗，目标页走原有 `backLink` 兜底。

现有接入示例：`../Scores/openScoreModal.tsx` 与 `../Scores/ScoreModal.tsx`。
