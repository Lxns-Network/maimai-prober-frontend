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
  TextInput, Divider, Space, SegmentedControl,
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
  const [confirmAlert, setConfirmAlert] = useState<() => void>(() => {});
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [networkError, setNetworkError] = useState(false);
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

  useEffect(() => {
    document.title = "同步游戏数据 | maimai DX 查分器";

    const intervalId = setInterval(checkProxy, 5000);

    return () => {
      clearInterval(intervalId);
    };
  });

  useEffect(() => {
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
        使用 HTTP 代理同步你的玩家数据与成绩
      </Text>
      {(new Date()).getHours() >= 18 &&
        <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="游玩高峰期警告" color="yellow" mb="xl">
          <Text size="sm" mb="md">
            由于现在是游玩高峰期，同步成绩可能会十分缓慢，甚至同步失败。我们建议你在日间或凌晨进行同步，或者尝试更改爬取设置以增加稳定性。
          </Text>
          <Group>
            <Button variant="outline" color="yellow" onClick={() => navigate("/user/settings")}>
              更改爬取设置
            </Button>
          </Group>
        </Alert>
      }
      {(new Date()).getHours() >= 5 && (new Date()).getHours() < 7 && (
        <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="NET 维护中" color="red" mb="xl">
          <Text size="sm">
            由于现在是 NET 维护时间（凌晨 5 时至早上 7 时），故无法进行同步。
          </Text>
        </Alert>
      )}
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
              选择爬取的游戏并使用微信打开 OAuth 链接
            </Text>
            <Card withBorder radius="md" className={classes.card} mb="md" p="md">
              <Text size="sm" mb="xs">
                请选择你要爬取的游戏：
              </Text>
              <SegmentedControl size="md" mb="md" color="blue" fullWidth value={game} onChange={setGame} data={[
                { label: '舞萌 DX', value: 'maimai' },
                { label: '中二节奏', value: 'chunithm' },
              ]} />
              <Text size="sm" mb="xs">
                请复制下方的微信 OAuth 链接，然后在安全的聊天中发送链接并打开，等待同步结果返回。
              </Text>
              <CopyButtonWithIcon
                label="复制微信 OAuth 链接"
                content={`${API_URL}/${game ? game : 'maimai'}/wechat/auth?token=${window.btoa(localStorage.getItem("token") as string)}`}
              />
              <Alert icon={<Icon path={mdiAlertCircleOutline} />} title="请不要泄露或使用未知 OAuth 链接！" color="red" mt="md">
                请不要将该 OAuth 链接分享给他人，否则可能导致你的账号被盗用。
              </Alert>
            </Card>
          </Group>
        } loading={proxyAvailable && crawlStatus == null} />
        <Stepper.Step label="步骤 3" description={
          <Text>等待数据同步完成</Text>
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
          {(crawlStatus?.status !== "finished" && crawlStatus?.status !== "failed") ? (
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