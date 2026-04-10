import { useEffect, useState } from 'react';
import {
  Accordion, Button, Code, Card, Flex, Group, Loader, Text, ThemeIcon, Alert, Stepper, Divider, Space, Stack,
  Paper, SimpleGrid,
  HoverCard,
  Mark
} from '@mantine/core';
import Icon from "@mdi/react";
import { mdiCheck, mdiPause } from "@mdi/js";
import { useIdle, useMediaQuery } from '@mantine/hooks';
import { IconAlertCircle, IconChevronRight, IconDownload, IconHelp, IconRepeat } from "@tabler/icons-react";
import { openAlertModal } from "@/utils/modal";
import { checkProxy } from "@/utils/checkProxy.ts";
import { getUserCrawlToken } from "@/utils/api/user.ts";
import { API_URL } from "@/utils/api/api.ts";
import classes from './Sync.module.css';

import { LoginAlert } from "@/components/LoginAlert";
import { RadioCardGroup } from "@/components/RadioCardGroup.tsx";
import { CrawlTokenAlert } from "@/components/Sync/CrawlTokenAlert.tsx";
import { CopyButtonWithIcon } from "@/components/Sync/CopyButtonWithIcon.tsx";
import { WechatOAuthLink } from "@/components/Sync/WechatOAuthLink.tsx";
import { ScoresChangesModal } from "@/components/Sync/ScoresChangesModal.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { Game } from "@/types/game";
import { getCrawlStatistic } from "@/utils/api/misc.ts";
import useShellViewportSize from "@/hooks/useShellViewportSize.ts";
import useGame from "@/hooks/useGame.ts";
import { navigate } from 'vike/client/router';

export interface ScoreChangeDetailProps {
  new: unknown;
  old: unknown;
}

export interface ScoreChangesProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  // maimai
  type: string;
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
  game: Game;
  friend_code: number;
  status: "pending" | "assigned" | "completed" | "failed";
  error_message?: string;
  create_time: string;
  complete_time: string;
  scores: ScoreChangesProps[];
  failed_difficulties: number[];
}

interface CrawlStatisticProps {
  success_rate: number;
  average_crawl_time: number;
}

const SyncContent = () => {
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [proxySkipped, setProxySkipped] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [crawlStatistic, setCrawlStatistic] = useState<CrawlStatisticProps | null>(null);
  const [crawlToken, setCrawlToken] = useState<string | null>(null);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusProps | null>(null);
  const [resultOpened, setResultOpened] = useState(false);
  const [step, setStep] = useState(0);
  const [sseResetKey, setSseResetKey] = useState(0);
  const [game, setGame] = useGame();
  const idle = useIdle(60000);

  const isLoggedOut = !localStorage.getItem("token");

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
    const getCrawlStatisticHandler = async () => {
      try {
        const res = await getCrawlStatistic(game);
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message);
        }
        setCrawlStatistic(data.data);
      } catch (error) {
        console.log(error);
      }
    }

    if (game) getCrawlStatisticHandler();
  }, [game]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (idle || step > 1 || proxySkipped) return;

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

  useEffect(() => {
    if (isLoggedOut || !(proxyAvailable || proxySkipped)) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const abortController = new AbortController();

    let lastStatus: CrawlStatusProps["status"] | null = null;
    let waitingForNewTask = sseResetKey > 0;

    const connectSSE = async () => {
      try {
        const res = await fetch(`${API_URL}/user/crawl/status`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "text/event-stream",
          },
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        let readerDone = false;
        while (!readerDone) {
          const { done, value } = await reader.read();
          if (done) { readerDone = true; break; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const parsed = JSON.parse(line.slice(6));
            if (!parsed || !parsed.status) continue;
            const status = parsed as CrawlStatusProps;

            if (status.status === "pending" || status.status === "assigned") {
              waitingForNewTask = false;
            }
            if (waitingForNewTask && (status.status === "completed" || status.status === "failed")) {
              continue;
            }

            lastStatus = status.status;
            setCrawlStatus(prev => ({ ...prev, ...status }));

            if (status.status === "pending" || status.status === "assigned") {
              setStep(2);
            } else if (status.status === "completed") {
              setStep(3);
              openAlertModal("同步游戏数据成功", "你的游戏数据已成功同步到 maimai DX 查分器。");
            } else if (status.status === "failed") {
              setStep(3);
              openAlertModal("同步游戏数据失败", status.error_message || "你的游戏数据同步时出现了错误，请查看同步结果了解详情。");
            }
          }
        }

        // 连接正常关闭，若任务未完成则重连
        if (lastStatus && lastStatus !== "completed" && lastStatus !== "failed") {
          setTimeout(connectSSE, 3000);
        }
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        console.error("SSE connection error:", error);
        // 异常断开，若有进行中的任务则重连
        if (lastStatus && lastStatus !== "completed" && lastStatus !== "failed") {
          setTimeout(connectSSE, 3000);
        }
      }
    };

    connectSSE();

    return () => {
      abortController.abort();
    };
  }, [proxyAvailable, proxySkipped, game, sseResetKey]);

  const { width } = useShellViewportSize();
  const [containerWidth, setContainerWidth] = useState(width);
  const small = useMediaQuery('(max-width: 600px)');
  const extraSmall = useMediaQuery('(max-width: 400px)');

  useEffect(() => {
    if (width > 692) {
      setContainerWidth(606);
    } else {
      setContainerWidth(width - 86);
    }
  }, [width]);

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
        (proxyAvailable || proxySkipped) ? (
          crawlStatus != null ? (
            (crawlStatus.status === "completed" || crawlStatus.status === "failed") ? 4 : 3
          ) : 2
        ) : 0
      } orientation="vertical" allowNextStepsSelect={false}>
        <Stepper.Step label="步骤 1" description={
          <Group gap="xs" w={containerWidth}>
            <Group gap="xs" justify="space-between" w="100%">
              <Text fz="sm">
                配置 HTTP 代理
              </Text>
              {!proxyAvailable && !proxySkipped && (
                <Button variant="subtle" size="compact-xs" rightSection={<IconChevronRight size={14} />} styles={{ section: { marginInlineStart: 2 } }} onClick={() => {
                  setProxySkipped(true);
                  setStep(1);
                }}>
                  跳过
                </Button>
              )}
            </Group>
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
        } loading={!proxyAvailable && !proxySkipped} />
        <Stepper.Step label="步骤 2" description={
          <Stack gap="xs" w={containerWidth}>
            <Text fz="sm">
              选择需要爬取的游戏
            </Text>
            <RadioCardGroup data={[
              { name: '舞萌 DX', description: '爬取玩家信息、成绩与收藏品', value: 'maimai' },
              { name: '中二节奏', description: '爬取玩家信息、成绩与收藏品', value: 'chunithm' },
            ]} value={game} onChange={(value) => setGame(value as Game)} />
            <Card className={classes.card} withBorder radius="md" mt="xs" mb="lg">
              <Text fz="lg" fw={700}>
                服务器状态
              </Text>
              <Text fz="xs" c="dimmed" mt={3} mb="md">
                查询「{game === "maimai" ? "舞萌 DX" : "中二节奏"}」最近的爬取统计
              </Text>
              <Group grow gap="xs">
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">近期爬取成功率</Text>
                  <Text fz="md">
                    {crawlStatistic ? `${(crawlStatistic.success_rate * 100).toFixed(2)}%` : "N/A"}
                  </Text>
                </Paper>
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">平均爬取耗时</Text>
                  <Text>
                    {crawlStatistic ? `${(crawlStatistic.average_crawl_time / 1000).toFixed(2)} 秒` : "N/A"}
                  </Text>
                </Paper>
              </Group>
            </Card>
          </Stack>
        } />
        <Stepper.Step label="步骤 3" description={
          <Stack gap="xs" w={containerWidth}>
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
        } loading={(proxyAvailable || proxySkipped) && !crawlStatus} />
        <Stepper.Step label="步骤 4" description={
          <Text fz="sm">
            等待数据同步完成
          </Text>
        } loading={(proxyAvailable || proxySkipped) && (crawlStatus?.status === "pending" || crawlStatus?.status === "assigned")} />
      </Stepper>
      <LoginAlert content="你需要登录查分器账号才能查看数据同步状态，并管理你同步的游戏数据。" mt="xs" radius="md" />
      {!isLoggedOut && (() => {
        const statusColor = !crawlStatus ? "default" : {
          "pending": "default",
          "assigned": "default",
          "completed": "teal",
          "failed": "red",
        }[crawlStatus.status];

        const statusText = !crawlStatus ? "等待前置步骤完成" : {
          "pending": "正在排队等待爬取",
          "assigned": "正在爬取游戏数据",
          "completed": "游戏数据同步成功",
          "failed": "游戏数据同步不完全",
        }[crawlStatus.status];

        return (
        <Card withBorder radius="md" className={classes.card} p="md" mt="xs">
          <Card.Section className={classes.section}>
            <Text size="xs" c="dimmed">
              数据同步状态
            </Text>
            <Text fz="lg" c={statusColor}>
              {statusText}
            </Text>
          </Card.Section>

          {(!crawlStatus || (crawlStatus.status !== "completed" && crawlStatus.status !== "failed")) ? (
            <Card.Section p="md">
              <Text size="sm">
                你的「{game === "maimai" ? "舞萌 DX" : "中二节奏"}」玩家信息与成绩将会被同步到 maimai DX 查分器，并与你的查分器账号绑定。
              </Text>
            </Card.Section>
          ) : (
            <>
              <Card.Section className={classes.section}>
                {crawlStatus.status === "failed" && crawlStatus.error_message && (
                  <Alert radius="md" color="red" icon={<IconAlertCircle />} title="爬取过程中出现错误" mb="md">
                    <Text size="sm">{crawlStatus.error_message}</Text>
                  </Alert>
                )}
                <SimpleGrid cols={extraSmall ? 1 : 2} spacing="xs">
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">好友码</Text>
                    <Text fz="sm">{crawlStatus.friend_code}</Text>
                  </Paper>
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">爬取耗时</Text>
                    <Text fz="sm">{Math.floor((new Date(crawlStatus.complete_time).getTime() - new Date(crawlStatus.create_time).getTime()) / 1000)} 秒</Text>
                  </Paper>
                  <Paper className={classes.subParameters}>
                    <Group gap={4} align="center">
                      <Text fz="xs" c="dimmed">成绩变化数</Text>
                      <HoverCard width={280} shadow="md" withArrow>
                        <HoverCard.Target>
                          <ThemeIcon variant="subtle" color="gray" size="xs" style={{ cursor: 'pointer' }}>
                            <IconHelp />
                          </ThemeIcon>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                          <Text size="sm">
                            本次爬取过程中，服务器成功获取并<Mark>有变化</Mark>的成绩数量。
                          </Text>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    </Group>
                    <Text fz="sm">{(crawlStatus.scores || []).length}</Text>
                  </Paper>
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">失败难度</Text>
                    <Text fz="sm">
                      {(!crawlStatus.failed_difficulties || crawlStatus.failed_difficulties.length === 0) ? "无" : crawlStatus.failed_difficulties.map((difficulty) => {
                        const names: Record<number, string> = {
                          0: "BASIC",
                          1: "ADVANCED",
                          2: "EXPERT",
                          3: "MASTER",
                          4: crawlStatus.game === "maimai" ? "Re:MASTER" : "ULTIMA",
                          5: "WORLD'S END",
                          10: "U·TA·GE",
                        };
                        return names[difficulty] ?? `难度 ${difficulty}`;
                      }).join("、")}
                    </Text>
                  </Paper>
                </SimpleGrid>
              </Card.Section>
              <Card.Section p="md">
                <SimpleGrid cols={small ? 2 : 4}>
                  <Button onClick={() => setResultOpened(true)}>
                    查看同步结果
                  </Button>
                  <Button variant="outline" leftSection={<IconRepeat size={18} />} onClick={() => {
                    setCrawlStatus(null);
                    setStep(1);
                    setSseResetKey(k => k + 1);
                  }}>
                    重新同步
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/user/profile")}>
                    账号详情
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/user/scores")}>
                    成绩管理
                  </Button>
                </SimpleGrid>
              </Card.Section>
            </>
          )}
        </Card>
        );
      })()}
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
