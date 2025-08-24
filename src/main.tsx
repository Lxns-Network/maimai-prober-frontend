import './wdyr';

import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from "react-router-dom";
import { router } from './router';
import { Helmet } from "react-helmet";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/nprogress/styles.css";
import "@mantine/notifications/styles.css";
import '@mantine/carousel/styles.css';
import '@mantine/tiptap/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/code-highlight/styles.css';
import "mantine-datatable/styles.css";
import "./index.css";

export const API_URL = import.meta.env.VITE_API_URL;
export const ASSET_URL = import.meta.env.VITE_ASSET_URL;
export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://6f7c9d4f59ea874de247d03efb40d9dd@o4509891862134784.ingest.us.sentry.io/4509891875962880",
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/maimai.lxns.net/ ],
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Helmet>
      <title>maimai DX 查分器</title>
      <meta name="description"
            content="一个简单的舞萌 DX & 中二节奏国服查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。"/>
      <meta name="keywords"
            content="maimai,maimai DX,舞萌,舞萌 DX,CHUNITHM,中二,中二节奏,查分,查分器,查分网站,传分,传分器,传分网站"/>
      <meta name="author" content="落雪咖啡屋"/>
    </Helmet>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
