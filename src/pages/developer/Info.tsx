import {
  Group, Text, Loader, Card, Switch, ActionIcon, Tooltip, CopyButton, Anchor, Divider, useMantineTheme, Button,
  TextInput, Stack, Flex, Alert
} from '@mantine/core';
import { resetDeveloperApiKey } from "@/utils/api/developer.ts";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff, mdiWebOff } from "@mdi/js";
import { useDisclosure }  from "@mantine/hooks";
import { IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import classes from "../Page.module.css";
import { useComputedColorScheme } from "@mantine/core";
import { Page } from "@/components/Page/Page.tsx";
import { DeveloperOAuthSection } from "@/components/Developer/DeveloperOAuthSection.tsx";
import { useDeveloper } from "@/hooks/swr/useDeveloper.ts";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

const DeveloperInfoContent = () => {
  const { developer, isLoading, error, mutate } = useDeveloper();
  const [visible, visibleHandler] = useDisclosure(false);
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
      await mutate((prevData) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          api_key: data.data.api_key,
        };
      })
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (isLoading) return;

    if (!developer|| !developer.api_key) {
      navigate("/developer/apply");
    }
  }, [isLoading, developer]);

  if (error) {
    return (
      <Alert radius="md" icon={<Icon path={mdiWebOff} />} title={`没有获取到开发者数据`} color="red" mb="md">
        <Text size="sm">
          可能是网络连接已断开，请检查你的网络连接是否正常。
        </Text>
      </Alert>
    )
  }

  return (
    <Stack gap="md">
      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          我的申请信息
        </Text>
        <Text fz="xs" c="dimmed" mt={3}>
          查看你的开发者申请信息
        </Text>
        <Divider mt="md" mb="md" color={computedColorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[2]} />
        {isLoading && (
          <Group justify="center" m="xs">
            <Loader />
          </Group>
        )}
        {developer && (
          <Stack gap="xs">
            <Flex align="center" columnGap="md" wrap="wrap">
              <Text fz="xs" c="dimmed" w={60}>开发者名称</Text>
              <Text fz="sm">{developer.name}</Text>
            </Flex>
            <Flex align="center" columnGap="md" wrap="wrap">
              <Text fz="xs" c="dimmed" w={60}>开发者地址</Text>
              <Text fz="sm">
                <Anchor href={developer.url} target="_blank" fz="sm">{developer.url.replace(/(^\w+:|^)\/\//, '')}</Anchor>
              </Text>
            </Flex>
            <Flex align="center" columnGap="md" wrap="wrap">
              <Text fz="xs" c="dimmed" w={60}>申请时间</Text>
              <Text fz="sm">
                {new Date(developer.apply_time).toLocaleString()}
              </Text>
            </Flex>
            <Flex align="center" columnGap="md" wrap="wrap">
              <Text fz="xs" c="dimmed" w={60}>申请理由</Text>
              <Text fz="sm">
                {developer.reason}
              </Text>
            </Flex>
          </Stack>
        )}
      </Card>

      <Card withBorder radius="md" className={classes.card}>
        <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
          <div>
            <Text fz="lg" fw={700}>
              开发者 API 密钥
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              用于访问 maimai DX 查分器开发者 API
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
        {isLoading && (
          <Group justify="center">
            <Loader />
          </Group>
        )}
        {developer && (
          <TextInput
            variant="filled"
            value={visible ? developer.api_key : developer.api_key.replace(/./g, '•')}
            rightSection={
              <CopyButton value={developer.api_key} timeout={2000}>
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
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" size="sm" leftSection={<IconRefresh size={20} />} onClick={resetDeveloperApiKeyHandler}>
            重置 API 密钥
          </Button>
        </Group>
      </Card>

      <DeveloperOAuthSection />
    </Stack>
  )
}

export default function DeveloperInfo() {
  return (
    <Page
      meta={{
        title: "开发者面板",
        description: "查看你的 maimai DX 查分器开发者信息",
      }}
      children={<DeveloperInfoContent />}
    />
  )
}