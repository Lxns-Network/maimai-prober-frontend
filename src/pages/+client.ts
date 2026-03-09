import '../wdyr';

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/nprogress/styles.css";
import "@mantine/notifications/styles.css";
import '@mantine/carousel/styles.css';
import '@mantine/tiptap/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/code-highlight/styles.css';
import "mantine-datatable/styles.css";
import "../index.css";

window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof TypeError && event.reason.message.includes('Failed to fetch dynamically imported module')) {
    event.preventDefault();
    window.location.reload();
  }
});

import * as Sentry from "@sentry/react";
import { getSentryUser } from "../utils/session.ts";

Sentry.init({
  dsn: "https://6f7c9d4f59ea874de247d03efb40d9dd@o4509891862134784.ingest.us.sentry.io/4509891875962880",
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/maimai.lxns.net/],
  profileSessionSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

const sentryUser = getSentryUser();
if (sentryUser) {
  Sentry.setUser(sentryUser);
}
