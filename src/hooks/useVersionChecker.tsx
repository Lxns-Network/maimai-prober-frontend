import { useEffect, useRef } from 'react';
import { notifications } from "@mantine/notifications";
import { Button, Stack } from "@mantine/core";
import { useQuery } from '@tanstack/react-query';

export function useVersionChecker(interval = 60000) {
  const currentVersionRef = useRef<string | null>(null);
  const notifiedRef = useRef(false);

  const isProd = import.meta.env.PROD;
  const { data } = useQuery<{ version: string }>({
    queryKey: ['version.json'],
    queryFn: () => fetch('/version.json?_t=' + Date.now()).then((res) => res.json()),
    enabled: isProd,
    refetchInterval: interval,
    refetchOnWindowFocus: true,
    retry: true,
  });

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
