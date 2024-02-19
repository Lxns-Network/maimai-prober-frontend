import { useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Code,
  Card,
  Container,
  Flex,
  Group,
  Loader,
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
import { mdiCheck, mdiPause } from "@mdi/js";
import { useIdle, useLocalStorage, useResizeObserver } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { getCrawlStatus, getUserCrawlToken } from "../../utils/api/user";
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconRefresh,
  IconRepeat
} from "@tabler/icons-react";
import classes from './Sync.module.css';
import { openAlertModal } from "../../utils/modal.tsx";
import { checkProxy } from "../../utils/checkProxy.tsx";

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
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
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

const CrawlTokenAlert = ({ token, resetHandler }: any) => {
  const getExpireTime = (crawlToken: string) => {
    return Math.floor(((JSON.parse(atob(crawlToken.split('.')[1])).exp - new Date().getTime() / 1000)) / 60)
  }

  const isTokenExpired = token && getExpireTime(token) < 0;
  const alertColor = isTokenExpired ? 'yellow' : 'blue';

  return (
    <Alert variant="light" icon={<IconAlertCircle />} title="链接有效期提示" color={alertColor}>
      <Text size="sm" mb="md">
        {token ? `该链接${
          isTokenExpired ? "已失效，" : `将在 ${getExpireTime(token) + 1} 分钟内失效，逾时`
        }请点击下方按钮刷新 OAuth 链接。` : "链接未生成，请点击下方按钮生成 OAuth 链接。"}
      </Text>
      <Button variant="outline" leftSection={<IconRefresh size={20} />} onClick={resetHandler} color={alertColor}>
        {token ? "刷新链接" : "生成链接"}
      </Button>
    </Alert>
  );
};

interface CrawlStatusProps {
  game: string;
  friend_code: number;
  status: string;
  create_time: string;
  complete_time: string;
  crawled_score_count: number;
  failed_difficulties: number[];
}

export default function Sync() {
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [crawlToken, setCrawlToken] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusProps | null>(null);
  const [step, setStep] = useState(0);
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const navigate = useNavigate();
  const idle = useIdle(60000);

  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  const getUserCrawlTokenHandler = async () => {
    try {
      const res = await getUserCrawlToken();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setCrawlToken(data.data.token);
      setStep(1);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    document.title = "同步游戏数据 | maimai DX 查分器";

    if (!isLoggedOut) getUserCrawlTokenHandler();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (idle || step > 1) return;

      checkProxy().then((result) => {
        if (result.proxyAvailable && !result.networkError) {
          setStep(1);
        } else {
          setStep(0);
        }
        setProxyAvailable(result.proxyAvailable);
        setNetworkError(result.networkError);
      });
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  });

  const checkCrawlStatus = async () => {
    if (idle || step === 0) return;

    if (crawlStatus != null && crawlStatus.status != "pending") {
      setStep(3);
      return;
    }

    try {
      const res = await getCrawlStatus();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (data.data != null) {
        if (data.data.status === "pending") {
          setStep(2);
        } else {
          setStep(3);
          openAlertModal("同步游戏数据成功", "你的游戏数据已成功同步到 maimai DX 查分器。")
        }
        setCrawlStatus(data.data);
      }
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    if (isLoggedOut) return;

    const intervalId = setInterval(checkCrawlStatus, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [crawlStatus, proxyAvailable]);

  const [stepper, stepperRect] = useResizeObserver();

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        同步游戏数据
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        使用 HTTP 代理同步你的玩家数据与成绩
      </Text>
      {(new Date()).getHours() >= 18 &&
        <Alert radius="md" icon={<IconAlertCircle />} title="游玩高峰期警告" color="yellow" mb="xl">
          <Text size="sm" mb="md">
            由于现在是游玩高峰期，同步成绩可能会十分缓慢，甚至同步失败。我们建议你在日间或凌晨进行同步，或者尝试更改爬取设置以增加稳定性。
          </Text>
          <Button variant="outline" color="yellow" onClick={() => navigate("/user/settings")}>
            更改爬取设置
          </Button>
        </Alert>
      }
      {(new Date()).getHours() >= 4 && (new Date()).getHours() < 7 && (
        <Alert radius="md" icon={<IconAlertCircle />} title="NET 维护中" color="red" mb="xl">
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
          <Group gap="xs" w={stepperRect.width - 54}>
            <Text fz="sm">
              配置 HTTP 代理
            </Text>
            <Card withBorder radius="md" className={classes.card} mb="md" p={0} w="100%">
              <Flex align="center" justify="space-between" m="md">
                <Group className={classes.loaderText} wrap="nowrap">
                  {proxyAvailable ? (
                    <div>
                      <Text size="lg" c="tal">
                        HTTP 代理已配置
                      </Text>
                      <Text size="xs" c="dimmed">
                        请继续执行下一步操作
                      </Text>
                    </div>
                  ) : (networkError ? (
                    <div>
                      <Text size="lg" c="red">网络连接已断开</Text>
                      <Text size="xs" c="dimmed">
                        请检查你的 HTTP 代理设置是否正确
                      </Text>
                    </div>
                  ) : (idle ? (
                    <div>
                      <Text size="lg">已暂停检测 HTTP 代理</Text>
                      <Text size="xs" c="dimmed">
                        请移动鼠标或触摸屏幕以继续检测
                      </Text>
                    </div>
                  ) : (
                    <div>
                      <Text size="lg">正在检测 HTTP 代理</Text>
                      <Text size="xs" c="dimmed">
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
              <Text>
                <Accordion variant="filled" chevronPosition="left" defaultValue="how-to-set-http-proxy">
                  <Accordion.Item value="how-to-set-http-proxy">
                    <Accordion.Control>我该如何设置 HTTP 代理？</Accordion.Control>
                    <Accordion.Panel>
                      <Text size="sm" c="dimmed" mb="xs">
                        请将系统的 WLAN 代理设置为 <Code>proxy.maimai.lxns.net:8080</Code>，Android 用户在移动网络下需要设置接入点名称（APN）代理。
                      </Text>
                      <CopyButtonWithIcon label="复制 HTTP 代理" content="proxy.maimai.lxns.net" />
                      <Divider my="xs" label="或使用 Clash 代理" labelPosition="center" />
                      <Flex>
                        <CopyButtonWithIcon label="复制 Clash 订阅链接" content="https://maimai.lxns.net/api/v0/proxy-config/clash" style={{
                          flex: 1,
                        }} />
                        <Space w="xs" />
                        <Button variant="light" rightSection={<IconDownload size={20} />} onClick={
                          () => window.location.href = "clash://install-config?url=https://maimai.lxns.net/api/v0/proxy-config/clash"
                        }>一键导入配置</Button>
                      </Flex>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Text>
            </Card>
          </Group>
        } loading={!proxyAvailable} />
        <Stepper.Step label="步骤 2" description={
          <Stack gap="xs" w={stepperRect.width - 54}>
            <Text fz="sm">
              选择需要爬取的游戏
            </Text>
            <SegmentedControl size="md" mb="md" color="blue" fullWidth value={game} onChange={setGame} data={[
              { label: '舞萌 DX', value: 'maimai' },
              { label: '中二节奏', value: 'chunithm' },
            ]} />
          </Stack>
        } />
        <Stepper.Step label="步骤 3" description={
          <Stack gap="xs" w={stepperRect.width - 54}>
            <Text fz="sm">
              复制微信 OAuth 链接，发送至安全的聊天中并打开
            </Text>
            <CopyButtonWithIcon
              label="复制微信 OAuth 链接"
              content={`${API_URL}/${game ? game : 'maimai'}/wechat/auth` + (crawlToken ? `?token=${window.btoa(crawlToken)}` : "")}
            />
            {!isLoggedOut && (
              <Text>
                <CrawlTokenAlert token={crawlToken} resetHandler={getUserCrawlTokenHandler} />
              </Text>
            )}
            <Space h="sm" />
          </Stack>
        } loading={proxyAvailable && !crawlStatus} />
        <Stepper.Step label="步骤 4" description={
          <Text fz="sm">
            等待数据同步完成
          </Text>
        } loading={proxyAvailable && crawlStatus?.status === "pending"} />
      </Stepper>
      {isLoggedOut ? (
        <Alert variant="light" icon={<IconAlertCircle />} title="登录提示" mt="-lg">
          <Text size="sm" mb="md">
            你需要登录查分器账号才能查看数据同步状态，并管理你同步的游戏数据。
          </Text>
          <Group>
            <Button variant="filled" onClick={() => navigate("/login")}>
              登录
            </Button>
            <Button variant="outline" onClick={() => navigate("/register")}>
              注册
            </Button>
          </Group>
        </Alert>
      ) : (
        <Card withBorder radius="md" className={classes.card} p="md" mt="-lg">
          <Card.Section className={classes.section}>
            <Text size="xs" c="dimmed">
              数据同步状态
            </Text>
            <Text fz="lg" c={
              crawlStatus ? (
                  crawlStatus.status === "failed" ? "red" : (
                    crawlStatus.status === "finished" ? "teal" : "default"
                  )
              ) : "default"
            }>
              {!crawlStatus && "等待前置步骤完成"}
              {crawlStatus && {
                "pending": "服务端正在爬取游戏数据",
                "finished": "游戏数据同步成功",
                "failed": "成绩同步失败"
              }[crawlStatus.status]}
            </Text>
          </Card.Section>

          {(!crawlStatus || (crawlStatus.status !== "finished" && crawlStatus.status !== "failed")) ? (
            <Card.Section p="md">
              <Text size="sm">
                你的{game === "maimai" ? "舞萌 DX " : "中二节奏"}游戏数据（玩家信息、成绩）将会被同步到 maimai DX 查分器，并与你的查分器账号绑定。
              </Text>
            </Card.Section>
          ) : (
            <>
              <Card.Section className={classes.section}>
                <Text fz="xs" c="dimmed">好友码</Text>
                <Text fz="sm">{crawlStatus.friend_code}</Text>
                <Group mt="md">
                  <div>
                    <Text fz="xs" c="dimmed">爬取耗时</Text>
                    <Text fz="sm">{Math.floor((new Date(crawlStatus.complete_time).getTime() - new Date(crawlStatus.create_time).getTime()) / 1000)} 秒</Text>
                  </div>
                  <div>
                    <Text fz="xs" c="dimmed">爬取的成绩数</Text>
                    <Text fz="sm">{crawlStatus.crawled_score_count || 0}</Text>
                  </div>
                  <div>
                    <Text fz="xs" c="dimmed">爬取失败的难度</Text>
                    <Text fz="sm">
                      {(!crawlStatus.failed_difficulties || crawlStatus.failed_difficulties.length === 0) ? "无" : crawlStatus.failed_difficulties.map((difficulty) => {
                        return [
                          "BASIC",
                          "ADVANCED",
                          "EXPERT",
                          "MASTER",
                          crawlStatus.game === "maimai" ? "Re:MASTER" : "ULTIMA",
                        ][difficulty];
                      }).join("、")}
                    </Text>
                  </div>
                </Group>
              </Card.Section>
              <Card.Section p="md" pb={0}>
                <Group justify="space-between">
                  <Group>
                    <Button onClick={() => navigate("/user/profile")}>
                      账号详情
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/user/scores")}>
                      成绩管理
                    </Button>
                  </Group>
                  <Button variant="outline" leftSection={<IconRepeat size={18} />} onClick={() => {
                    setCrawlStatus(null);
                    setStep(1);
                  }}>
                    重新同步
                  </Button>
                </Group>
              </Card.Section>
            </>
          )}
        </Card>
      )}
    </Container>
  );
}