import { Button, Group, Text } from "@mantine/core";
import { IconAlertCircle, IconClock, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";

interface CrawlTokenStatusProps {
  token: string | null;
  resetHandler: () => void;
}

const getRemainingSeconds = (crawlToken: string) => {
  return Math.floor(JSON.parse(atob(crawlToken.split(".")[1])).exp - Date.now() / 1000);
};

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Renders the crawl token validity countdown, ticking every second while the token is valid. */
export const CrawlTokenStatus = ({ token, resetHandler }: CrawlTokenStatusProps) => {
  const [remaining, setRemaining] = useState<number | null>(
    token ? getRemainingSeconds(token) : null,
  );

  useEffect(() => {
    if (!token) {
      setRemaining(null);
      return;
    }

    setRemaining(getRemainingSeconds(token));
    const intervalId = window.setInterval(() => {
      const seconds = getRemainingSeconds(token);
      setRemaining(seconds);
      if (seconds <= 0) window.clearInterval(intervalId);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [token]);

  const isTokenExpired = remaining !== null && remaining <= 0;

  if (isTokenExpired) {
    return (
      <Group justify="space-between" align="center" gap={6} wrap="nowrap">
        <Group gap={6} c="red" wrap="nowrap" miw={0} style={{ flexShrink: 1 }}>
          <IconAlertCircle size={16} style={{ flexShrink: 0 }} />
          <Text size="sm" fw={500} truncate>
            链接已失效，请刷新
          </Text>
        </Group>
        <Button
          variant="light"
          color="red"
          size="compact-sm"
          leftSection={<IconRefresh size={14} />}
          styles={{ section: { marginInlineEnd: 6 } }}
          onClick={resetHandler}
          style={{ flexShrink: 0 }}
        >
          刷新链接
        </Button>
      </Group>
    );
  }

  return (
    <Group justify="space-between" align="center" gap={6} wrap="nowrap">
      <Group
        gap={6}
        c="var(--mantine-primary-color-light-color)"
        wrap="nowrap"
        miw={0}
        style={{ flexShrink: 1 }}
      >
        <IconClock size={16} style={{ flexShrink: 0 }} />
        <Text
          size="sm"
          fw={500}
          c="var(--mantine-primary-color-light-color)"
          style={{ fontVariantNumeric: "tabular-nums" }}
          truncate
        >
          {token ? `链接有效期 ${formatCountdown(remaining ?? 0)}` : "链接未生成"}
        </Text>
      </Group>
      <Button
        variant="light"
        size="compact-sm"
        leftSection={<IconRefresh size={14} />}
        styles={{ section: { marginInlineEnd: 6 } }}
        onClick={resetHandler}
        style={{ flexShrink: 0 }}
      >
        {token ? "刷新链接" : "生成链接"}
      </Button>
    </Group>
  );
};
