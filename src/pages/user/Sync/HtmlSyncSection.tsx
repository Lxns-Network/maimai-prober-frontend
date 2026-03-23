import { useState } from "react";
import { Alert, Badge, Button, Card, Group, Modal, Paper, SimpleGrid, Stack, Text, Textarea, ThemeIcon } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconCode, IconFileImport, IconTrash, IconUpload } from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import useGame from "@/hooks/useGame.ts";
import { RadioCardGroup } from "@/components/RadioCardGroup.tsx";
import { openAlertModal } from "@/utils/modal";
import { ScoresChangesModal } from "@/components/Sync/ScoresChangesModal.tsx";
import { syncHtml } from "@/utils/api/user.ts";
import { ScoreChangesProps, SyncResult } from "@/pages/user/Sync";
import classes from "../Sync.module.css";

interface UploadItem {
  id: string;
  name: string;
  source: "file" | "text";
  content: string;
  size: number;
  error?: string;
}

interface HtmlSyncResult {
  game: SyncResult["game"];
  scores: ScoreChangesProps[];
}

interface HtmlSyncFailure {
  name: string;
  reason: string;
}

const scoreChangeKey = (score: ScoreChangesProps) => `${score.id}:${score.type}:${score.level_index}`;

const scoreChangeDetailKeys = [
  "achievements",
  "dx_rating",
  "dx_score",
  "fc",
  "fs",
  "score",
  "rating",
  "over_power",
  "full_combo",
  "full_chain",
] as const satisfies ReadonlyArray<keyof ScoreChangesProps>;

const isLikelyHtmlDocument = (content: string) => {
  const normalized = content.toLowerCase();
  return normalized.includes("<html") || normalized.includes("<!doctype html");
};

const normalizeHtmlContent = (content: string) => content.trim();

const extractHtmlTitle = (content: string) => {
  const match = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return title || null;
};

const createHtmlSyncResult = (game: SyncResult["game"], scores: ScoreChangesProps[]): HtmlSyncResult => ({
  game,
  scores,
});

const mergeScoreChangeDetail = (
  current?: ScoreChangesProps[typeof scoreChangeDetailKeys[number]],
  incoming?: ScoreChangesProps[typeof scoreChangeDetailKeys[number]],
) => {
  const merged = {} as ScoreChangesProps[typeof scoreChangeDetailKeys[number]];
  const oldValue = current?.old !== undefined ? current.old : incoming?.old;
  const newValue = incoming?.new !== undefined ? incoming.new : current?.new;

  if (oldValue !== undefined) merged.old = oldValue;
  if (newValue !== undefined) merged.new = newValue;

  return merged;
};

const mergeHtmlSyncResults = (results: HtmlSyncResult[]): HtmlSyncResult | null => {
  if (results.length === 0) return null;

  const scoreMap = new Map<string, ScoreChangesProps>();

  for (const result of results) {
    for (const score of result.scores || []) {
      const key = scoreChangeKey(score);
      const existingScore = scoreMap.get(key);

      if (!existingScore) {
        scoreMap.set(key, score);
        continue;
      }

      const mergedScore = {
        ...existingScore,
        ...score,
      };

      for (const detailKey of scoreChangeDetailKeys) {
        mergedScore[detailKey] = mergeScoreChangeDetail(existingScore[detailKey], score[detailKey]);
      }

      scoreMap.set(key, mergedScore);
    }
  }

  return {
    ...results[0],
    scores: Array.from(scoreMap.values()),
  };
};

export const HtmlSyncSection = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [isTextModalOpened, setIsTextModalOpened] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [resultModalOpened, setResultModalOpened] = useState(false);
  const [hasImportedResult, setHasImportedResult] = useState(false);
  const [game, setGame] = useGame();
  const small = useMediaQuery("(max-width: 600px)");

  const appendUploadItem = (item: Omit<UploadItem, "id">) => {
    setUploadItems((current) => [...current, {
      ...item,
      id: crypto.randomUUID(),
    }]);
  };

  const selectHtmlFiles = () => {
    const file = document.createElement("input");
    file.type = "file";
    file.multiple = true;
    file.accept = ".html,.txt,text/html,text/plain";
    file.onchange = async () => {
      const selectedFiles = Array.from(file.files || []);
      if (selectedFiles.length === 0) return;

      for (const selectedFile of selectedFiles) {
        if (!/\.(html|txt)$/i.test(selectedFile.name)) {
          openAlertModal("添加失败", `文件「${selectedFile.name}」不是 .html 或 .txt 文件。`);
          return;
        }
      }

      for (const selectedFile of selectedFiles) {
        const html = normalizeHtmlContent(await selectedFile.text());
        if (!isLikelyHtmlDocument(html)) {
          openAlertModal("添加失败", `文件「${selectedFile.name}」不包含有效的 HTML 标签结构。`);
          return;
        }
        appendUploadItem({
          name: selectedFile.name,
          source: "file",
          content: html,
          size: selectedFile.size,
        });
      }
    };
    file.click();
  };

  const addPastedHtml = () => {
    const trimmed = normalizeHtmlContent(htmlContent);
    if (!trimmed) {
      openAlertModal("添加失败", "请先粘贴 HTML 文本。");
      return;
    }

    if (!isLikelyHtmlDocument(trimmed)) {
      openAlertModal("添加失败", "当前内容不包含有效的 HTML 标签结构。");
      return;
    }

    const textItemCount = uploadItems.filter((item) => item.source === "text").length + 1;
    const pageTitle = extractHtmlTitle(trimmed);
    appendUploadItem({
      name: pageTitle || `未知网页 ${textItemCount}`,
      source: "text",
      content: trimmed,
      size: new Blob([trimmed]).size,
    });
    setHtmlContent("");
    setIsTextModalOpened(false);
  };

  const removeUploadItem = (id: string) => {
    setUploadItems((current) => current.filter((item) => item.id !== id));
  };

  const submitHtmlUploads = async () => {
    if (uploadItems.length === 0) {
      openAlertModal("导入失败", "请先添加至少一个 HTML 输入。");
      return;
    }

    const uploadGame = game;
    setIsUploading(true);
    try {
      const itemsToUpload = uploadItems.map((item) => ({ ...item }));
      const results: HtmlSyncResult[] = [];
      const failures: Array<HtmlSyncFailure & { id: string }> = [];
      for (const item of itemsToUpload) {
        try {
          const res = await syncHtml(uploadGame, item.content);
          const data = await res.json();
          if (!data.success) {
            failures.push({
              id: item.id,
              name: item.name,
              reason: data.message,
            });
            continue;
          }
          results.push(createHtmlSyncResult(uploadGame, data.data));
        } catch (error) {
          failures.push({
            id: item.id,
            name: item.name,
            reason: `${error}`,
          });
        }
      }

      const mergedResult = mergeHtmlSyncResults(results);
      if (!mergedResult && failures.length > 0) {
        const failureMap = new Map(failures.map((failure) => [failure.id, failure.reason]));
        setUploadItems(itemsToUpload
          .filter((item) => failureMap.has(item.id))
          .map((item) => ({
            ...item,
            error: failureMap.get(item.id),
          })));
        throw new Error(`共 ${failures.length} 份 HTML 处理失败。`);
      }
      if (!mergedResult) {
        throw new Error("没有可处理的 HTML 输入。");
      }

      if (failures.length > 0) {
        const failureMap = new Map(failures.map((failure) => [failure.id, failure.reason]));
        setUploadItems(itemsToUpload
          .filter((item) => failureMap.has(item.id))
          .map((item) => ({
            ...item,
            error: failureMap.get(item.id),
          })));
        setHasImportedResult(true);
        setSyncResult({
          game: mergedResult.game,
          scores: mergedResult.scores,
        });
        openAlertModal("部分导入失败", `成功导入 ${results.length} 份 HTML，失败 ${failures.length} 份。`);
        return;
      }

      setUploadItems([]);
      setHasImportedResult(true);
      setSyncResult({
        game: mergedResult.game,
        scores: mergedResult.scores,
      });
      setResultModalOpened(true);
    } catch (error) {
      openAlertModal("导入失败", `${error}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <ScoresChangesModal
        game={syncResult?.game ?? game}
        scores={syncResult?.scores ?? []}
        opened={resultModalOpened}
        onClose={() => setResultModalOpened(false)}
      />
      <Modal opened={isTextModalOpened} onClose={() => setIsTextModalOpened(false)} title="粘贴 HTML 文本" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            将页面 HTML 源码粘贴到这里，确认后加入待上传列表。
          </Text>
          <Textarea
            placeholder="将保存下来的页面源码粘贴到这里"
            rows={10}
            value={htmlContent}
            onChange={(event) => setHtmlContent(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setIsTextModalOpened(false)}>
              取消
            </Button>
            <Button onClick={addPastedHtml} leftSection={<IconCode size={18} />}>
              加入列表
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Card withBorder radius="md" className={classes.card} p="md" mb="xl">
        <Stack gap="md">
          <div>
            <Text fz="lg" fw={700}>上传 HTML 文件</Text>
            <Text fz="sm" c="dimmed" mt={4}>
              上传你保存的成绩页面 HTML 文件
            </Text>
          </div>
          <div>
            <Text fz="sm" mb="xs">选择游戏</Text>
            <RadioCardGroup
              data={[
                { name: '舞萌 DX', description: '导入舞萌 DX 页面', value: 'maimai' },
                { name: '中二节奏', description: '导入中二节奏页面', value: 'chunithm' },
              ]}
              value={game}
              onChange={(value) => setGame(value as typeof game)}
            />
          </div>
          <Alert radius="md" color="blue" icon={<IconFileImport size={18} />} title="文件要求">
            <Stack gap="xs">
              <Text size="sm">
                仅支持从 NET 保存的完整 HTML 源码。你可以上传文件，也可以直接粘贴 HTML 文本。
              </Text>
              <Text size="sm">
                目前支持玩家信息、收藏品、最近游玩记录、最佳成绩等页面。
              </Text>
            </Stack>
          </Alert>
          <Group>
            <Button onClick={selectHtmlFiles} disabled={isUploading} leftSection={<IconFileImport size={18} />}>
              选择 HTML 文件
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsTextModalOpened(true)}
              disabled={isUploading}
              leftSection={<IconCode size={18} />}
            >
              粘贴 HTML 文本
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            文件可多选，文本输入可多次添加。
          </Text>
          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <div>
                  <Text fz="md" fw={700}>待上传 HTML（{uploadItems.length}）</Text>
                  <Text fz="sm" c="dimmed">文件与文本会统一转换为 HTML 源码后顺序上传。</Text>
                </div>
                <Button
                  onClick={submitHtmlUploads}
                  loading={isUploading}
                  disabled={uploadItems.length === 0}
                  leftSection={<IconUpload size={18} />}
                >
                  开始上传
                </Button>
              </Group>
              {uploadItems.length === 0 ? (
                <Text size="sm" c="dimmed">
                  暂无待上传内容。你可以添加多个 HTML 文件，或通过多次粘贴 HTML 文本加入列表。
                </Text>
              ) : (
                <Stack gap="xs">
                  {uploadItems.map((item) => (
                    <Paper key={item.id} withBorder p="sm" radius="md">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Group gap="xs" mb={4}>
                            <Text fw={600} truncate>{item.name}</Text>
                            <Badge variant="light">{item.source === "file" ? "文件" : "文本"}</Badge>
                            {item.error && (
                              <ThemeIcon color="red" variant="light" size="sm" radius="xl">
                                <IconAlertCircle size={12} />
                              </ThemeIcon>
                            )}
                          </Group>
                          <Text size="sm" c="dimmed">
                            大小约 {(item.size / 1024).toFixed(1)} KB，长度 {item.content.length} 字符
                          </Text>
                          {item.error && (
                            <Text size="sm" c="red" mt={4}>
                              {item.error}
                            </Text>
                          )}
                        </div>
                        <Button
                          variant="subtle"
                          color="red"
                          size="compact-sm"
                          onClick={() => removeUploadItem(item.id)}
                          disabled={isUploading}
                          leftSection={<IconTrash size={14} />}
                        >
                          删除
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
          <SimpleGrid cols={small ? 2 : 3}>
            <Button disabled={!hasImportedResult} onClick={() => setResultModalOpened(true)}>
              查看同步结果
            </Button>
            <Button variant="outline" onClick={() => navigate("/user/profile")}>
              账号详情
            </Button>
            <Button variant="outline" onClick={() => navigate("/user/scores")}>
              成绩管理
            </Button>
          </SimpleGrid>
        </Stack>
      </Card>
    </>
  );
};
