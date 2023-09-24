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
  ThemeIcon,
  Alert,
  Stepper,
  CopyButton,
  Tooltip,
  ActionIcon,
  TextInput, Divider, Space,
} from '@mantine/core';
import { API_URL } from '../../main';
import Icon from "@mdi/react";
import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiContentCopy,
  mdiOpenInApp,
  mdiPause,
  mdiReload
} from "@mdi/js";
import { useIdle, useLocalStorage } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { getCrawlStatus } from "../../utils/api/user";
import useAlert from "../../utils/useAlert";
import AlertModal from "../../components/AlertModal";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  section: {
    borderBottom: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
    }`,
    padding: theme.spacing.md,
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

const CopyButtonWithIcon = ({ label, content, ...others }: any) => {
  return (
    <TextInput
      variant="filled"
      value={content}
      onFocus={(e) => e.target.select()}
      rightSection={
        <CopyButton value={content} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已复制' : label} withArrow position="right">
              <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                <Icon path={copied ? mdiCheck : mdiContentCopy} size={0.75} />
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      }
      readOnly
      {...others}
    />
  )
}

interface CrawlStatusProps {
  status: string;
  friend_code: number;
  crawled_score_count: number;
  failed_difficulties: number[];
}

export default function Sync() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [firstCrawl, setFirstCrawl] = useLocalStorage({ key: 'first-crawl', defaultValue: true });
  const [confirmAlert, setConfirmAlert] = useState<() => void>(() => {});
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusProps | null>(null);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const idle = useIdle(60000);

  useEffect(() => {
    document.title = "同步游戏数据 | maimai DX 查分器";

    const checkProxy = () => {
      if (idle) return;

      checkProxySettingStatus().then(r => {
        if (active > 1) return;

        if (r === 0) { // No proxy
          setActive(0);
          setProxyAvailable(false);
          setNetworkError(false);
        } else if (r === 1) { // Network issue
          setActive(0);
          setProxyAvailable(false);
          setNetworkError(true);
        } else { // Proxy
          setActive(1);
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

  useEffect(() => {
    const checkCrawlStatus = () => {
      if (idle || !proxyAvailable) {
        return;
      }

      if (crawlStatus != null && crawlStatus.status != "pending") {
        setActive(3);
        return;
      }

      getCrawlStatus()
        .then(res => res?.json())
        .then(data => {
          if (data.data != null) {
            if (data.data.status === "pending") {
              setActive(2);
            } else {
              if (!firstCrawl) {
                setConfirmAlert(() => null);
                openAlert("同步游戏数据成功", "你的游戏数据已成功同步到 maimai DX 查分器。");
              } else {
                setConfirmAlert(() => () => {
                  navigate("/user/settings");
                });
                openAlert("同步游戏数据成功", "你的游戏数据已成功同步到 maimai DX 查分器。在初次同步后，我们推荐你前往账号设置将爬取方式变更为“增量爬取”，这会使之后的爬取更加稳定。");
                setFirstCrawl(false);
              }
              setActive(3);
            }
            setCrawlStatus(data.data);
          }
        })
    }

    const intervalId = setInterval(checkCrawlStatus, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [crawlStatus, proxyAvailable]);

  return (
    <Container className={classes.root} size={400}>
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
        onConfirm={confirmAlert}
      />
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        同步游戏数据
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        使用 HTTP 代理同步你的 maimai DX 玩家数据与成绩
      </Text>
      <Stepper active={
        proxyAvailable ? (
          crawlStatus != null ? (
            crawlStatus.status !== "pending" ? 3 : 2
          ) : 1
        ) : 0
      } orientation="vertical" allowNextStepsSelect={false}>
        <Stepper.Step label="步骤 1" description={
          <Group spacing="md">
            <Text>
              配置 HTTP 代理
            </Text>
            <Card withBorder radius="md" className={classes.card} mb="md" p={0} w="100%">
              <Flex align="center" justify="space-between" m="md">
                <Group className={classes.loaderText} noWrap>
                  {proxyAvailable ? (
                    <div>
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
                  ) : (idle ? (
                    <div>
                      <Text size="lg">已暂停检测 HTTP 代理</Text>
                      <Text size="xs" color="dimmed">
                        请移动鼠标或触摸屏幕以继续检测
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text size="lg">正在检测 HTTP 代理</Text>
                      <Text size="xs" color="dimmed">
                        正在检测 HTTP 代理是否正确配置
                      </Text>
                    </div>
                  )))}
                </Group>
                {proxyAvailable ? (
                  <ThemeIcon variant="light" color="teal" size="xl" radius="xl">
                    <Icon path={mdiCheck} size={10} />
                  </ThemeIcon>
                ) : (idle ? (
                  <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
                    <Icon path={mdiPause} size={10} />
                  </ThemeIcon>
                ) : (
                  <Loader size="md" />
                ))}
              </Flex>
              <Accordion variant="filled" chevronPosition="left" defaultValue="how-to-set-http-proxy">
                <Accordion.Item value="how-to-set-http-proxy">
                  <Accordion.Control>我该如何设置 HTTP 代理？</Accordion.Control>
                  <Accordion.Panel>
                    <Text size="sm" color="dimmed" mb="xs">
                      请将系统的 WLAN 代理设置为 <Code>proxy.maimai.lxns.net:8080</Code>，Android 用户在移动网络下需要设置接入点名称（APN）代理。
                    </Text>
                    <CopyButtonWithIcon label="复制 HTTP 代理" content="proxy.maimai.lxns.net" />
                    <Divider my="xs" label="或使用 Clash 代理" labelPosition="center" />
                    <Flex>
                      <CopyButtonWithIcon label="复制 HTTP 代理" content="https://maimai.lxns.net/api/v0/proxy-config/clash" style={{
                        flex: 1,
                      }} />
                      <Space w="xs" />
                      <Button variant="light" rightIcon={<Icon path={mdiOpenInApp} size={0.75} />} onClick={
                        () => window.location.href = "clash://install-config?url=https://maimai.lxns.net/api/v0/proxy-config/clash"
                      }>一键导入配置</Button>
                    </Flex>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Card>
          </Group>
        } loading={!proxyAvailable} />
        <Stepper.Step label="步骤 2" description={
          <Group spacing="md">
            <Text>
              使用微信打开 OAuth 链接
            </Text>
            <Card withBorder radius="md" className={classes.card} mb="md" p="md">
              <Text size="sm" mb="xs">
                请复制下方的微信 OAuth 链接，然后在安全的聊天中发送链接并打开，等待同步结果返回。
              </Text>
              <CopyButtonWithIcon
                label="复制微信 OAuth 链接"
                content={`${API_URL}/wechat/auth?token=${window.btoa(localStorage.getItem("token") as string)}`}
                disabled={!proxyAvailable}
              />
              <Alert icon={<Icon path={mdiAlertCircleOutline} />} title="请不要泄露或使用未知 OAuth 链接！" color="red" mt="md">
                请不要将该 OAuth 链接分享给他人，或是使用其他人的链接授权微信，否则可能导致你的账号被盗用。
              </Alert>
            </Card>
          </Group>
        } loading={proxyAvailable && crawlStatus == null} />
        <Stepper.Step label="步骤 3" description={
          <Text>同步完成</Text>
        } loading={proxyAvailable && crawlStatus?.status === "pending"} />
      </Stepper>
      <Card withBorder radius="md" className={classes.card} p="md" mt={rem(-12)}>
        <Card.Section className={classes.section}>
          <Text size="xs" color="dimmed">
            数据同步状态
          </Text>
          <Text fz="lg" color={
            crawlStatus?.status === "failed" ? "red" : (
              crawlStatus?.status === "finished" ? "teal" : "default"
            )
          }>
            {!crawlStatus && "等待前置步骤完成"}
            {crawlStatus && {
              "pending": "服务端正在爬取游戏数据",
              "finished": "游戏数据同步成功",
              "failed": "成绩同步失败"
            }[crawlStatus?.status]}
          </Text>
        </Card.Section>

        <Card.Section className={classes.section}>
          {crawlStatus?.status !== "finished" ? (
            <Text size="sm">
              你的国服 maimai DX 玩家数据与成绩将会被同步到 maimai DX 查分器，并与你的查分器账号绑定。
            </Text>
          ) : (
            <>
              <Group>
                <Text fz="xs" c="dimmed">好友码</Text>
                <Text fz="sm">{crawlStatus.friend_code}</Text>
              </Group>
              <Group mt="xs">
                <Text fz="xs" c="dimmed">爬取的成绩数</Text>
                <Text fz="sm">{crawlStatus.crawled_score_count}</Text>
              </Group>
              <Group mt="xs">
                <Text fz="xs" c="dimmed">爬取失败的难度</Text>
                <Text fz="sm">
                  {(crawlStatus.failed_difficulties == undefined || crawlStatus.failed_difficulties.length === 0) ? "无" : crawlStatus.failed_difficulties.map((difficulty) => {
                    return {
                      0: "BASIC",
                      1: "ADVANCED",
                      2: "EXPERT",
                      3: "MASTER",
                      4: "REMASTER",
                    }[difficulty];
                  }).join("、")}
                </Text>
              </Group>
              <Group mt="md" position="apart">
                <Group>
                  <Button onClick={() => navigate("/user/profile")}>
                    账号详情
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/user/scores")}>
                    成绩管理
                  </Button>
                </Group>
                <Button variant="outline" leftIcon={<Icon path={mdiReload} size={0.75} />} onClick={() => {
                  setCrawlStatus(null);
                  setActive(1);
                }}>
                  重新同步
                </Button>
              </Group>
            </>
          )}
        </Card.Section>
      </Card>
    </Container>
  );
}