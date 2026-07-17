import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MantineProvider } from "@mantine/core";
import { getNotificationDisplay } from "./notificationTemplates.tsx";

describe("broadcast notification rendering", () => {
  it("removes active embedded content while preserving safe formatting", () => {
    const display = getNotificationDisplay({
      id: 1,
      category: "broadcast",
      type: "system",
      level: "normal",
      title: "测试通知",
      content:
        '<iframe srcdoc="<script>parent.localStorage.clear()</script>"></iframe><strong>安全内容</strong>',
      read: false,
      create_time: "2026-07-17T00:00:00.000Z",
    });

    const html = renderToStaticMarkup(<MantineProvider>{display.body}</MantineProvider>);

    expect(html).toContain("<strong>安全内容</strong>");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("script");
  });

  it("preserves editor formatting and constrains notification images", () => {
    const display = getNotificationDisplay({
      id: 2,
      category: "broadcast",
      type: "system",
      level: "normal",
      title: "格式测试",
      content:
        '<mark>高亮</mark><u>下划线</u><img src="https://example.com/image.png" alt="通知配图" style="position:fixed;max-width:none">',
      read: false,
      create_time: "2026-07-17T00:00:00.000Z",
    });

    const html = renderToStaticMarkup(<MantineProvider>{display.body}</MantineProvider>);

    expect(html).toContain("<mark>高亮</mark>");
    expect(html).toContain("<u>下划线</u>");
    expect(html).toContain('alt="通知配图"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("max-width:100%");
    expect(html).not.toContain("position:fixed");
  });
});
