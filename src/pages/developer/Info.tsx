import { useEffect, useState } from 'react';
import {
  Container,
  Group,
  Text,
  Title,
  Loader,
  Card,
  Switch,
  ActionIcon,
  Tooltip,
  CopyButton,
  Anchor,
  Divider,
  useMantineTheme,
  Button, TextInput,
} from '@mantine/core';
import { getDeveloperApply, resetDeveloperApiKey } from "../../utils/api/developer";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff } from "@mdi/js";
import { useDisclosure, useSetState } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import { IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import classes from "../Page.module.css";
import { useComputedColorScheme } from "@mantine/core";

export default function DeveloperInfo() {
  const [developerData, setDeveloperData] = useSetState<any>(null);
  const [visible, visibleHandler] = useDisclosure(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const computedColorScheme = useComputedColorScheme('light');
  const navigate = useNavigate();
  const theme = useMantineTheme();

  const resetDeveloperApiKeyHandler = async () => {
    try {
      const res = await resetDeveloperApiKey();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setDeveloperData({ api_key: data.data.api_key });
    } catch (err) {
      console.error(err);
    }
  }

  const getDeveloperApplyHandler = async () => {
    try {
      const res = await getDeveloperApply();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (!data.data || !data.data.api_key) {
        navigate("/developer/apply");
      }
      setDeveloperData(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoaded(true);
    }
  }

  useEffect(() => {
    document.title = "开发者面板 | maimai DX 查分器";

    getDeveloperApplyHandler();
  }, []);

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        开发者面板
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        查看你的 maimai DX 查分器开发者信息
      </Text>
      {!isLoaded ? (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <>
          <Card withBorder radius="md" className={classes.card} mb="md">
            <Text fz="lg" fw={700}>
              我的申请信息
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              查看你的开发者申请信息
            </Text>
            <Divider mt="md" mb="md" color={computedColorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[2]} />
            <Group>
              <Text fz="xs" c="dimmed">项目名称</Text>
              <Text fz="sm">{developerData.name}</Text>
            </Group>
            <Group mt="xs">
              <Text fz="xs" c="dimmed">项目地址</Text>
              <Text fz="sm">
                <Anchor href={developerData.url} target="_blank" fz="sm">{developerData.url.replace(/(^\w+:|^)\/\//, '')}</Anchor>
              </Text>
            </Group>
            <Group mt="xs">
              <Text fz="xs" c="dimmed">申请时间</Text>
              <Text fz="sm">
                {new Date(developerData.apply_time).toLocaleString()}
              </Text>
            </Group>
            <Group mt="xs">
              <Text fz="xs" c="dimmed">申请理由</Text>
              <Text fz="sm">
                {developerData.reason}
              </Text>
            </Group>
          </Card>
          <Card withBorder radius="md" className={classes.card}>
            <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
              <div>
                <Text fz="lg" fw={700}>
                  开发者 API 密钥
                </Text>
                <Text fz="xs" c="dimmed" mt={3}>
                  用于访问 maimai DX 查分器 API
                </Text>
              </div>
              <Switch
                size="lg"
                value={visible ? "visible" : "hidden"}
                onClick={visibleHandler.toggle}
                onLabel={<Icon path={mdiEye} size={0.8} />}
                offLabel={<Icon path={mdiEyeOff} size={0.8} />}
              />
            </Group>
            <TextInput
              variant="filled"
              value={visible ? developerData.api_key : developerData.api_key.replace(/./g, '•')}
              rightSection={
                <CopyButton value={developerData.api_key} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? '已复制' : '复制'} withArrow position="right">
                      <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                        {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              }
              readOnly
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" size="sm" leftSection={<IconRefresh size={20} />} onClick={resetDeveloperApiKeyHandler}>
                重置 API 密钥
              </Button>
            </Group>
          </Card>
        </>
      )}
    </Container>
  );
}
