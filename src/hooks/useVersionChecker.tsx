import { useEffect, useRef } from 'react';
import { notifications } from "@mantine/notifications";
import { Button, Stack } from "@mantine/core";
import useSWR from 'swr';

const fetcher = (url: string) =>
  fetch(url + '?_t=' + Date.now()).then((res) => res.json());

export function useVersionChecker(interval = 60000) {
  const currentVersionRef = useRef<string | null>(null);
  const notifiedRef = useRef(false);

  const isProd = import.meta.env.PROD;
  const { data } = useSWR<{ version: string }>(
    isProd ? '/version.json' : null,
    fetcher,
    {
      refreshInterval: interval,
      revalidateOnFocus: true,
      shouldRetryOnError: true,
    }
  );

  useEffect(() => {
    if (!isProd || !data?.version) return;

    if (!currentVersionRef.current) {
      currentVersionRef.current = data.version;
    } else if (
      currentVersionRef.current !== data.version &&
      !notifiedRef.current
    ) {
      notifiedRef.current = true;

      notifications.show({
        title: '新版本可用',
        message: (
          <Stack gap="xs" align="flex-start">
            <span>检测到新版本，请刷新页面以获取最新版本</span>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                window.location.reload();
              }}
            >
              刷新
            </Button>
          </Stack>
        ),
        color: 'blue',
        autoClose: false,
      });
    }
  }, [data, isProd]);
}