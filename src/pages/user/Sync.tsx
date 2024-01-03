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
  TextInput, Divider, Space, SegmentedControl, Stack,
} from '@mantine/core';
import { API_URL } from '../../main';
import Icon from "@mdi/react";
import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiPause,
  mdiReload
} from "@mdi/js";
import { useIdle, useLocalStorage, useResizeObserver } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { getCrawlStatus, getUserCrawlToken } from "../../utils/api/user";
import useAlert from "../../utils/useAlert";
import AlertModal from "../../components/AlertModal";
import { IconCheck, IconCopy, IconDownload, IconRefresh } from "@tabler/icons-react";

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
                {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
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
  const [confirmAlert, setConfirmAlert] = useState<() => void>(() => {});
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [crawlToken, setCrawlToken] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusProps | null>(null);
  const [active, setActive] = useState(0);
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const navigate = useNavigate();
  const idle = useIdle(60000);

  const checkProxy = async () => {
    if (idle || active > 1) return;
    try {
      await fetch(`https://maimai.wahlap.com/maimai-mobile/error/`, { mode: 'no-cors' });
    } catch (err) {
      try {
        await fetch(window.location.href, { mode: 'no-cors' });
        // Proxy
        setActive(1);
        setProxyAvailable(true);
        setNetworkError(false);
      } catch (err) {
        // Network issue
        setActive(0);
        setProxyAvailable(false);
        setNetworkError(true);
      }
      return;
    }
    // No proxy
    setActive(0);
    setProxyAvailable(false);
    setNetworkError(false);
  }

  const getUserCrawlTokenHandler = async () => {
    try {
      const res = await getUserCrawlToken();
      if (res == null) {
        return;
      }

      const data = await res.json();
      if (data.code === 200) {
        setCrawlToken(data.data.token);
        setActive(1);
      }
    } catch (error) {
      return;
    }
  }

  const getCrawlTokenExpireTime = (crawlToken: string) => {
    return Math.floor(((JSON.parse(atob(crawlToken.split('.')[1])).exp - new Date().getTime() / 1000)) / 60)
  }

  useEffect(() => {
    document.title = "同步游戏数据 | maimai DX 查分器";

    getUserCrawlTokenHandler();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(checkProxy, 5000);

    return () => {
      clearInterval(intervalId);
    };
  });

  const checkCrawlStatus = async () => {
    if (idle || active === 0) {
      return;
    }

    if (crawlStatus != null && crawlStatus.status != "pending") {
      setActive(3);
      return;
    }

    try {
      const res = await getCrawlStatus();
      if (res == null) {
        return;
      }

      const data = await res.json();
      if (data.data != null) {
        if (data.data.status === "pending") {
          setActive(2);
        } else {
          setActive(3);
          setConfirmAlert(() => null);
          openAlert("同步游戏数据成功", "你的游戏数据已成功同步到 maimai DX 查分器。");
        }
        setCrawlStatus(data.data);
      }
    } catch (error) {
      return;
    }
  }

  useEffect(() => {
    const intervalId = setInterval(checkCrawlStatus, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [crawlStatus, proxyAvailable]);

  const [stepper, stepperRect] = useResizeObserver<HTMLDivElement>();

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
        使用 HTTP 代理同步你的玩家数据与成绩
      </Text>
      {(new Date()).getHours() >= 18 &&
        <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="游玩高峰期警告" color="yellow" mb="xl">
          <Text size="sm" mb="md">
            由于现在是游玩高峰期，同步成绩可能会十分缓慢，甚至同步失败。我们建议你在日间或凌晨进行同步，或者尝试更改爬取设置以增加稳定性。
          </Text>
          <Button variant="outline" color="yellow" onClick={() => navigate("/user/settings")}>
            更改爬取设置
          </Button>
        </Alert>
      }
      {(new Date()).getHours() >= 4 && (new Date()).getHours() < 7 && (
        <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="NET 维护中" color="red" mb="xl">
          <Text size="sm">
            由于现在是 NET 维护时间，故无法进行同步，请于 7:00 后重试。
          </Text>
        </Alert>
      )}
      <Stepper active={
        proxyAvailable ? (
          crawlStatus != null ? (
            crawlStatus.status !== "pending" ? 4 : 3
          ) : 2
        ) : 0
      } orientation="vertical" allowNextStepsSelect={false} ref={stepper}>
        <Stepper.Step label="步骤 1" description={
          <Group spacing="md" w={stepperRect.width - 54}>
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
                      <Button variant="light" rightIcon={<IconDownload size={20} />} onClick={
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
          <Stack spacing="xs" w={stepperRect.width - 54}>
            <Text>
              选择需要爬取的游戏
            </Text>
            <SegmentedControl size="md" mb="md" color="blue" fullWidth value={game} onChange={setGame} data={[
              { label: '舞萌 DX', value: 'maimai' },
              { label: '中二节奏', value: 'chunithm' },
            ]} />
          </Stack>
        } />
        <Stepper.Step label="步骤 3" description={
          <Stack spacing="xs" w={stepperRect.width - 54}>
            <Text>
              复制微信 OAuth 链接，发送至安全的聊天中并打开
            </Text>
            <CopyButtonWithIcon
              label="复制微信 OAuth 链接"
              content={`${API_URL}/${game ? game : 'maimai'}/wechat/auth` + (crawlToken ? `?token=${window.btoa(crawlToken)}` : "")}
            />
            <Alert icon={<Icon path={mdiAlertCircleOutline} />} title="链接有效期提示" mb="md">
              <Text size="sm" mb="md">
                {crawlToken ? `该链接${
                  getCrawlTokenExpireTime(crawlToken) > 0 ? `将在 ${getCrawlTokenExpireTime(crawlToken) + 1} 分钟内失效，逾时` : "已失效，"
                }请点击下方按钮刷新 OAuth 链接。` : "链接未生成，请点击下方按钮生成 OAuth 链接。"}
              </Text>
              <Button variant="outline" leftIcon={<IconRefresh size={20} />} onClick={() => {
                getUserCrawlTokenHandler();
              }}>
                {crawlToken ? "刷新链接" : "生成链接"}
              </Button>
            </Alert>
          </Stack>
        } loading={proxyAvailable && crawlStatus == null} />
        <Stepper.Step label="步骤 4" description={
          <Text>等待数据同步完成</Text>
        } loading={proxyAvailable && crawlStatus?.status === "pending"} />
      </Stepper>
      <Card withBorder radius="md" className={classes.card} p="md" mt={rem(-12)}>
        <Card.Section className={classes.section}>
          <Group spacing="xl">
            {(!crawlStatus || crawlStatus?.status === "pending") && (
              <Loader variant="bars" />
            )}
            <div>
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
            </div>
          </Group>
        </Card.Section>

        <Card.Section className={classes.section}>
          {(crawlStatus?.status !== "finished" && crawlStatus?.status !== "failed") ? (
            <Text size="sm">
              你的{game === "maimai" ? "舞萌 DX " : "中二节奏"}游戏数据（玩家信息、成绩）将会被同步到 maimai DX 查分器，并与你的查分器账号绑定。
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