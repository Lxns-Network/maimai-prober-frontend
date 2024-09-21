import { useEffect, useState } from 'react';
import {
  Accordion, Button, Code, Card, Flex, Group, Loader, Text, ThemeIcon, Alert, Stepper, Divider, Space, Stack, SimpleGrid
} from '@mantine/core';
import Icon from "@mdi/react";
import { mdiCheck, mdiPause } from "@mdi/js";
import { useIdle, useLocalStorage, useMediaQuery, useResizeObserver } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { getCrawlStatus, getUserCrawlToken } from "@/utils/api/user.ts";
import { IconAlertCircle, IconDownload, IconRepeat } from "@tabler/icons-react";
import { openAlertModal } from "@/utils/modal";
import { checkProxy } from "@/utils/checkProxy.ts";
import classes from './Sync.module.css';

import { LoginAlert } from "@/components/LoginAlert";
import { RadioCardGroup } from "@/components/RadioCardGroup.tsx";
import { CrawlTokenAlert } from "@/components/Sync/CrawlTokenAlert.tsx";
import { CopyButtonWithIcon } from "@/components/Sync/CopyButtonWithIcon.tsx";
import { WechatOAuthLink } from "@/components/Sync/WechatOAuthLink.tsx";
import { ScoresChangesModal } from "@/components/Sync/ScoresChangesModal.tsx";
import { Page } from "@/components/Page/Page.tsx";

interface ScoreChangeDetailProps {
  new: any;
  old: any;
}

export interface ScoreChangesProps {
  id: number;
  level: string;
  level_index: number;
  type: string;
  // maimai
  achievements: ScoreChangeDetailProps;
  dx_rating: ScoreChangeDetailProps;
  dx_score: ScoreChangeDetailProps;
  fc: ScoreChangeDetailProps;
  fs: ScoreChangeDetailProps;
  // chunithm
  score: ScoreChangeDetailProps;
  rating: ScoreChangeDetailProps;
  over_power: ScoreChangeDetailProps;
  full_combo: ScoreChangeDetailProps;
  full_chain: ScoreChangeDetailProps;
}

interface CrawlStatusProps {
  game: "maimai" | "chunithm";
  friend_code: number;
  status: string;
  create_time: string;
  complete_time: string;
  scores: ScoreChangesProps[];
  failed_difficulties: number[];
}

const SyncContent = () => {
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [crawlToken, setCrawlToken] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusProps | null>(null);
  const [resultOpened, setResultOpened] = useState(false);
  const [step, setStep] = useState(0);
  const [game, setGame] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
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
          if (data.data.status === "failed") {
            openAlertModal("同步游戏数据失败", "你的游戏数据同步时出现了错误，请查看同步结果了解详情。")
          } else if (data.data.status === "finished") {
            openAlertModal("同步游戏数据成功", "你的游戏数据已成功同步到 maimai DX 查分器。")
          }
        }
        setCrawlStatus(data.data);
      }
    } catch (error) {
      openAlertModal("获取同步结果失败", `${error}`);
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
  const small = useMediaQuery('(max-width: 600px)');

  return (
    <div>
      <ScoresChangesModal game={crawlStatus ? crawlStatus.game : game} scores={crawlStatus ? crawlStatus.scores || [] : []} opened={resultOpened} onClose={() => setResultOpened(false)} />
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
                      <CopyButtonWithIcon label="复制 IP 地址" description="IP 地址" content="proxy.maimai.lxns.net" mb="xs" />
                      <CopyButtonWithIcon label="复制端口" description="端口" content="8080" />
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
          <Stack gap="xs" w={stepperRect.width - 54} mb="md">
            <Text fz="sm">
              选择需要爬取的游戏
            </Text>
            <RadioCardGroup data={[
              { name: '舞萌 DX', description: '爬取玩家信息、成绩与收藏品', value: 'maimai' },
              { name: '中二节奏', description: '爬取玩家信息、成绩与收藏品', value: 'chunithm' },
            ]} value={game} onChange={(value) => setGame(value as "maimai" | "chunithm")} />
          </Stack>
        } />
        <Stepper.Step label="步骤 3" description={
          <Stack gap="xs" w={stepperRect.width - 54}>
            <Text fz="sm">
              复制微信 OAuth 链接，发送至安全的聊天中并打开
            </Text>
            {game && <WechatOAuthLink game={game} crawlToken={crawlToken} />}
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
      <LoginAlert content="你需要登录查分器账号才能查看数据同步状态，并管理你同步的游戏数据。" mt="-lg" radius="md" />
      {!isLoggedOut && (
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
                你的「{game === "maimai" ? "舞萌 DX" : "中二节奏"}」玩家信息与成绩将会被同步到 maimai DX 查分器，并与你的查分器账号绑定。
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
                    <Text fz="sm">{(crawlStatus.scores || []).length}</Text>
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
              <Card.Section p="md">
                <SimpleGrid cols={small ? 2 : 4}>
                  <Button onClick={() => setResultOpened(true)}>
                    查看同步结果
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/user/profile")}>
                    账号详情
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/user/scores")}>
                    成绩管理
                  </Button>
                  <Button variant="outline" leftSection={<IconRepeat size={18} />} onClick={() => {
                    setCrawlStatus(null);
                    setStep(1);
                  }}>
                    重新同步
                  </Button>
                </SimpleGrid>
              </Card.Section>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

export default function Sync() {
  return (
    <Page
      meta={{
        title: "同步游戏数据",
        description: "使用 HTTP 代理同步你的玩家数据与成绩",
      }}
      children={<SyncContent />}
    />
  )
}