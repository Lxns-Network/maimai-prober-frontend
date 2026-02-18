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

import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://6f7c9d4f59ea874de247d03efb40d9dd@o4509891862134784.ingest.us.sentry.io/4509891875962880",
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/maimai.lxns.net/],
});
