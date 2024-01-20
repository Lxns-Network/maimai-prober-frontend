import {
  ActionIcon,
  Box,
  Button,
  Divider,
  LoadingOverlay,
  Modal,
  Stack,
  Text, useComputedColorScheme, useMantineTheme,
} from "@mantine/core";
import QRCode from "react-qr-code";
import Icon from "@mdi/react";
import { mdiOpenInNew, mdiRefresh } from "@mdi/js";
import { useEffect, useState } from "react";
import { useTimeout } from "@mantine/hooks";
import { refreshToken } from "../utils/api/user";

interface QrcodeModalProps {
  opened: boolean;
  onClose: () => void;
}

const QrcodeModalContent = () => {
  const { start, clear } = useTimeout(() => setExpired(true), 60000);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const computedColorScheme = useComputedColorScheme('light');
  const theme = useMantineTheme();

  const refresh = () => {
    refreshToken().then((result) => {
      if (result) {
        setToken(localStorage.getItem('token') || '');
        setExpired(false);
        setLoading(false);
        start();
      }
    })
  }

  useEffect(() => {
    start();
    return clear;
  }, []);

  return (
    <Stack align="center" m="xs">
      <Text fz="lg" fw={500}>请使用手机扫描二维码</Text>
      <Box pos="relative" h={138} p={5}>
        <LoadingOverlay visible={expired} overlayProps={{ radius: "sm", blur: 2 }} loaderProps={{ children: (
          <Stack align="center">
            <ActionIcon
              variant="default"
              radius={64}
              size={64}
              p={8}
              loading={loading}
              onClick={() => {
                setLoading(true);
                refresh();
              }}
            >
              <Icon path={mdiRefresh} size={10} />
            </ActionIcon>
            <Text ta="center" fz="xs">二维码已过期<br />请点击刷新</Text>
          </Stack>
        )}} />
        <QRCode
          value={`maimai-prober://login?token=${token}`}
          bgColor={computedColorScheme === 'dark' ? theme.colors.dark[7] : theme.white}
          fgColor={computedColorScheme === 'dark' ? theme.colors.dark[0] : theme.black}
          size={128}
        />
      </Box>
      <Text fz="sm" c="dimmed">
        你的查分器账号将会登录到应用
      </Text>
      <Divider mt="md" w="100%" label="已在同设备安装？" labelPosition="center" />
      <Button variant="outline" leftSection={
        <Icon path={mdiOpenInNew} size={0.8} />
      } onClick={
        () => window.location.href = `maimai-prober://login?token=${token}`
      }>跳转并登录到应用</Button>
    </Stack>
  )
}

export const QrcodeModal = ({ opened, onClose }: QrcodeModalProps) => {
  return (
    <Modal opened={opened} onClose={onClose} title="应用登录二维码" centered>
      <QrcodeModalContent />
    </Modal>
  );
}