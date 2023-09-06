import { useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Code,
  Card,
  Container,
  createStyles,
  Flex,
  Group,
  Loader,
  rem,
  Text,
  Title,
  CopyButton,
  ThemeIcon, Alert, Avatar
} from '@mantine/core';
import { API_URL } from '../../main';
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiCheck } from "@mdi/js";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  loaderText: {
    '& + &': {
      paddingTop: theme.spacing.sm,
      marginTop: theme.spacing.sm,
      borderTop: `${rem(1)} solid ${
        theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
      }`,
    },
  },
}));

async function checkProxySettingStatus() {
  try {
    // Try to fetch the external URL
    await fetch(`https://maimai.wahlap.com/maimai-mobile/error/`, { mode: 'no-cors' });
  } catch (error) {
    try {
      // Fetch current location's href to detect network issue
      await fetch(window.location.href, { mode: 'no-cors' });
      return 2; // If failed, return 2 (proxy)
    } catch (error) {
      return 1; // If successful, return 1 (network issue)
    }
  }
  return 0; // If successful, return 0 (no proxy)
}

export default function Sync() {
  const { classes } = useStyles();
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    const checkProxy = () => {
      checkProxySettingStatus().then(r => {
        if (r === 0) { // No proxy
          setProxyAvailable(false);
          setNetworkError(false);
        } else if (r === 1) { // Network issue
          setProxyAvailable(false);
          setNetworkError(true);
        } else { // Proxy
          setProxyAvailable(true);
          setNetworkError(false);
        }
      })
    };

    const intervalId = setInterval(checkProxy, 5000);

    return () => {
      clearInterval(intervalId);
    };
  });

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        同步游戏数据
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        使用 HTTP 代理同步你的 maimai DX 玩家数据与成绩
      </Text>
      <Group spacing="sm" mb="md">
        <Avatar color="blue" size={40} radius={40}>1</Avatar>
        <div>
          <Text fz="sm" fw={500}>步骤 1</Text>
          <Text c="dimmed" fz="xs">配置 HTTP 代理</Text>
        </div>
      </Group>
      <Card withBorder radius="md" className={classes.card} mb="md" p={0}>
        <Flex align="center" justify="space-between" m="md">
          <Group className={classes.loaderText} noWrap>
            {proxyAvailable ? (
              <div>e
                <Text size="lg" color="tal">
                  HTTP 代理已配置
                </Text>
                <Text size="xs" color="dimmed">
                  请继续执行下一步操作
                </Text>
              </div>
            ) : (networkError ? (
              <div>
                <Text size="lg" color="red">网络连接已断开</Text>
                <Text size="xs" color="dimmed">
                  请检查你的 HTTP 代理设置是否正确
                </Text>
              </div>
            ) : (
              <div>
                <Text size="lg">正在检测 HTTP 代理</Text>
                <Text size="xs" color="dimmed">
                  正在检测 HTTP 代理是否正确配置
                </Text>
              </div>
            ))}
          </Group>
          {proxyAvailable ? (
            <ThemeIcon variant="light" color="teal" size="xl" radius="xl">
              <Icon path={mdiCheck} size={10} />
            </ThemeIcon>
          ) : (
            <Loader size="md" />
          )}
        </Flex>
        <Accordion variant="filled" chevronPosition="left" defaultValue="how-to-set-http-proxy">
          <Accordion.Item value="how-to-set-http-proxy">
            <Accordion.Control>我该如何设置 HTTP 代理？</Accordion.Control>
            <Accordion.Panel>
              <Text size="sm" color="dimmed"  mb="md">
                请将系统的 WLAN 代理设置为 <Code>proxy.maimai.lxns.net:8080</Code>，Android 用户在移动网络下需要设置接入点名称（APN）代理。
              </Text>
              <CopyButton value="proxy.maimai.lxns.net">
                {({ copied, copy }) => (
                  <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                    {copied ? '已复制 HTTP 代理地址' : '复制 HTTP 代理地址'}
                  </Button>
                )}
              </CopyButton>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card>
      <Group spacing="sm" mb="md">
        <Avatar color="blue" size={40} radius={40}>2</Avatar>
        <div>
          <Text fz="sm" fw={500}>步骤 2</Text>
          <Text c="dimmed" fz="xs">使用微信打开 OAuth 链接</Text>
        </div>
      </Group>
      <Card withBorder radius="md" className={classes.card} mb="md" p="md">
        <Text size="sm" mb="md">
          请复制下方的微信 OAuth 链接，然后使用微信内置浏览器打开，等待同步结果返回。
        </Text>
        <CopyButton value={`${API_URL}/wechat/auth?token=${window.btoa(localStorage.getItem("token") as string)}`}>
          {({ copied, copy }) => (
            <Button color={copied ? 'teal' : 'blue'} onClick={copy} disabled={!proxyAvailable}>
              {copied ? '已复制微信 OAuth 链接' : '复制微信 OAuth 链接'}
            </Button>
          )}
        </CopyButton>
        <Alert icon={<Icon path={mdiAlertCircleOutline} />} title="请不要泄露该 OAuth 链接！" color="red" mt="md">
          请不要将该 OAuth 链接分享给他人，否则可能导致你的账号被盗用。
        </Alert>
      </Card>
      <Group spacing="sm" mb="md">
        <Avatar color="blue" size={40} radius={40}>3</Avatar>
        <div>
          <Text fz="sm" fw={500}>步骤 3</Text>
          <Text c="dimmed" fz="xs">游戏数据同步完成</Text>
        </div>
      </Group>
      <Card withBorder radius="md" className={classes.card} mb="md" p="md">
        <Text size="sm" mb="md">
          若同步成功，你的国服 maimai DX 玩家数据与成绩将会被同步到 maimai DX 查分器，并与你的查分器账号绑定。
        </Text>
        <Group>
          <Button variant="light">
            账号详情
          </Button>
          <Button variant="light">
            成绩管理
          </Button>
        </Group>
      </Card>
    </Container>
  );
}