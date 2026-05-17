import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Group,
  Loader,
  Modal,
  Progress,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronRight } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { API_URL } from "@/utils/api/api.ts";
import { recalculateScores, cancelRecalculateScores } from "@/utils/api/admin.ts";
import { openConfirmModal } from "@/utils/modal.tsx";
import { Game } from "@/types/game";
import classes from "@/pages/Page.module.css";
import settingClasses from "@/components/Settings/Settings.module.css";

interface ProgressState {
  running: boolean;
  current: number;
  total: number;
  title: string;
  count: number;
  cancelled?: boolean;
}

const GAMES: Game[] = ["maimai", "chunithm"];

const GAME_LABELS: Record<Game, string> = {
  maimai: "舞萌 DX",
  chunithm: "中二节奏",
};

async function* parseSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      let event = "message";
      let data = "";
      for (const line of part.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data += (data ? "\n" : "") + line.slice(5).replace(/^ /, "");
        }
      }
      yield { event, data };
    }
  }
}

export const RecalculateSection = () => {
  const [progressByGame, setProgressByGame] = useState<Record<Game, ProgressState | null>>({
    maimai: null,
    chunithm: null,
  });
  const [runningGames, setRunningGames] = useState<Record<Game, boolean>>({
    maimai: false,
    chunithm: false,
  });
  const [resubKey, setResubKey] = useState(0);
  const [modalOpened, modalHandlers] = useDisclosure(false);

  useEffect(() => {
    const controllers: AbortController[] = [];
    let disposed = false;

    const subscribe = async (game: Game) => {
      let sawRunning = false;

      while (!disposed) {
        const token = localStorage.getItem("token");
        if (!token) return;

        const controller = new AbortController();
        controllers.push(controller);
        let gotTerminal = false;

        try {
          const res = await fetch(`${API_URL}/user/admin/${game}/scores/recalculate`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "text/event-stream",
            },
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            if (!sawRunning) return;
            await new Promise((resolve) => setTimeout(resolve, 3000));
            continue;
          }

          for await (const { event, data } of parseSSE(res.body)) {
            if (disposed) return;

            if (event === "snapshot") {
              try {
                const parsed = JSON.parse(data) as ProgressState;
                if (parsed?.running === true) {
                  sawRunning = true;
                  setProgressByGame((prev) => ({ ...prev, [game]: parsed }));
                  setRunningGames((prev) => ({ ...prev, [game]: true }));
                } else {
                  setRunningGames((prev) => (prev[game] ? { ...prev, [game]: false } : prev));
                  setProgressByGame((prev) => (prev[game] ? { ...prev, [game]: null } : prev));
                }
              } catch {
                // 忽略无法解析的 payload
              }
            } else if (event === "progress") {
              try {
                const parsed = JSON.parse(data) as ProgressState;
                sawRunning = true;
                setProgressByGame((prev) => ({ ...prev, [game]: parsed }));
                setRunningGames((prev) => ({ ...prev, [game]: true }));
              } catch {
                // 忽略无法解析的 payload
              }
            } else if (event === "done") {
              gotTerminal = true;
              setRunningGames((prev) => (prev[game] ? { ...prev, [game]: false } : prev));
              setProgressByGame((prev) => ({ ...prev, [game]: null }));
              notifications.show({
                title: "重算完成",
                message: `「${GAME_LABELS[game]}」所有玩家成绩重算已完成`,
                color: "green",
              });
              break;
            } else if (event === "cancelled") {
              gotTerminal = true;
              setRunningGames((prev) => (prev[game] ? { ...prev, [game]: false } : prev));
              setProgressByGame((prev) => ({ ...prev, [game]: null }));
              notifications.show({
                title: "任务已取消",
                message: `「${GAME_LABELS[game]}」成绩重算任务已中止`,
                color: "yellow",
              });
              break;
            } else if (event === "error") {
              gotTerminal = true;
              let message = "重算过程中发生错误";
              try {
                const parsed = JSON.parse(data);
                if (parsed?.message) message = parsed.message;
              } catch {
                if (data) message = data;
              }
              setRunningGames((prev) => (prev[game] ? { ...prev, [game]: false } : prev));
              setProgressByGame((prev) => ({ ...prev, [game]: null }));
              notifications.show({
                title: `「${GAME_LABELS[game]}」重算失败`,
                message,
                color: "red",
              });
              break;
            }
          }
        } catch (error) {
          if ((error as DOMException).name === "AbortError") return;
        }

        if (disposed) return;
        // 正常结束（任务终结 / 无任务）不再重连；仅在任务运行中意外断开时重试
        if (gotTerminal || !sawRunning) return;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };

    GAMES.forEach(subscribe);

    return () => {
      disposed = true;
      controllers.forEach((c) => c.abort());
    };
  }, [resubKey]);

  const startRecalculate = async (game: Game) => {
    try {
      const res = await recalculateScores(game);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "启动失败");
      }
      setRunningGames((prev) => ({ ...prev, [game]: true }));
      setResubKey((k) => k + 1);
      notifications.show({
        title: "任务已启动",
        message: `「${GAME_LABELS[game]}」成绩重算任务已开始，可在下方查看进度`,
        color: "blue",
      });
    } catch (error) {
      notifications.show({
        title: "启动失败",
        message: `${error instanceof Error ? error.message : error}`,
        color: "red",
      });
    }
  };

  const cancelRecalculate = async (game: Game) => {
    try {
      const res = await cancelRecalculateScores(game);
      if (res.status === 404) {
        // 服务器说没有任务在跑，清掉本地残留状态并重订阅以对齐
        setRunningGames((prev) => (prev[game] ? { ...prev, [game]: false } : prev));
        setProgressByGame((prev) => (prev[game] ? { ...prev, [game]: null } : prev));
        setResubKey((k) => k + 1);
        notifications.show({ title: "当前没有正在运行的任务", message: "", color: "gray" });
        return;
      }
      if (res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `取消失败 (HTTP ${res.status})`);
      }
      notifications.show({
        title: "已发送取消请求",
        message: `「${GAME_LABELS[game]}」任务将在当前曲目处理完后中止`,
        color: "yellow",
      });
    } catch (error) {
      notifications.show({
        title: "取消失败",
        message: `${error instanceof Error ? error.message : error}`,
        color: "red",
      });
    }
  };

  const handleStart = (game: Game) => {
    openConfirmModal(
      `重算「${GAME_LABELS[game]}」所有玩家成绩`,
      "该操作将对全体玩家的成绩进行重算，过程极为耗时，期间将产生较高的数据库负载。确定要继续吗？",
      () => startRecalculate(game),
      { confirmProps: { color: "red" } },
    );
  };

  const handleCancel = (game: Game) => {
    openConfirmModal(
      `取消「${GAME_LABELS[game]}」重算任务`,
      "任务将在当前曲目处理完毕后中止，已完成的部分不会回滚。确定要取消吗？",
      () => cancelRecalculate(game),
      { confirmProps: { color: "yellow" } },
    );
  };

  const anyRunning = runningGames.maimai || runningGames.chunithm;

  return (
    <>
      <Modal opened={modalOpened} onClose={modalHandlers.close} title="成绩重算" centered size="lg">
        <Box>
          {GAMES.map((game) => {
            const running = runningGames[game];
            const progress = progressByGame[game];
            const percent =
              progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
            return (
              <Box key={game} className={settingClasses.item}>
                <Flex justify="space-between" align="center" columnGap="md" rowGap="xs" wrap="wrap">
                  <Box style={{ flex: 1 }}>
                    <Text>{GAME_LABELS[game]}</Text>
                    <Text size="xs" c="dimmed">
                      重新计算所有玩家的「{GAME_LABELS[game]}」成绩。
                    </Text>
                  </Box>
                  <Button
                    variant="outline"
                    color={running ? "yellow" : "red"}
                    onClick={() => (running ? handleCancel(game) : handleStart(game))}
                  >
                    {running ? "取消任务" : "重算"}
                  </Button>
                </Flex>
                {running && (
                  <Stack gap={6} mt="xs">
                    <Group justify="space-between" gap="xs">
                      <Text size="xs" c="dimmed">
                        已完成 {progress?.current ?? 0} / {progress?.total ?? "?"} 首曲目
                      </Text>
                      {progress?.title && (
                        <Text size="xs" c="dimmed" truncate style={{ flex: 1, textAlign: "right" }}>
                          {progress.title}
                        </Text>
                      )}
                    </Group>
                    <Progress value={percent} size="md" radius="sm" transitionDuration={300} />
                  </Stack>
                )}
              </Box>
            );
          })}
        </Box>
      </Modal>

      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          数据库管理
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="md">
          维护查分器的数据库，执行重算或修复等操作
        </Text>

        <UnstyledButton
          w="100%"
          pt={0}
          className={settingClasses.item}
          onClick={modalHandlers.open}
          style={{ cursor: "pointer" }}
        >
          <Flex justify="space-between" align="center" columnGap="md" rowGap="xs" wrap="wrap">
            <Box style={{ flex: 1 }}>
              <Group gap="xs" align="center" wrap="nowrap">
                <Text>成绩重算</Text>
                {anyRunning && (
                  <Badge
                    color="yellow"
                    variant="light"
                    size="sm"
                    leftSection={<Loader size={8} color="yellow" />}
                  >
                    进行中
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                重新计算所有玩家的成绩与 Rating。
              </Text>
            </Box>
            <IconChevronRight size={16} />
          </Flex>
        </UnstyledButton>
      </Card>
    </>
  );
};
