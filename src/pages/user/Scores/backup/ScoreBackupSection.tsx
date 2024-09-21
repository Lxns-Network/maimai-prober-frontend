import { useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { useScores } from "@/hooks/swr/useScores.ts";
import {
  Box, Card, Flex, Mark, SimpleGrid, Space, Text, ThemeIcon, Title, UnstyledButton
} from "@mantine/core";
import { IconFileExport, IconFileImport } from "@tabler/icons-react";
import { fetchAPI } from "@/utils/api/api.ts";
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { API_URL } from "@/main.tsx";
import React from "react";
import classes from "./ScoreBackupSection.module.css"

interface CardButtonProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}

const CardButton = ({ icon, title, description, disabled, onClick }: CardButtonProps) => {
  return (
    <UnstyledButton disabled={disabled} onClick={onClick}>
      <Card className={classes.cardButton} radius="md" withBorder mod={{
        disabled: disabled,
      }}>
        <Flex align="center" direction="column">
          <ThemeIcon variant="subtle" color="blue" size={64}>
            {icon}
          </ThemeIcon>
          <Space h="sm" />
          <Text fz="xl">{title}</Text>
          <Text fz="sm" c="dimmed">{description}</Text>
        </Flex>
      </Card>
    </UnstyledButton>
  )
}

export const ScoreBackupSection = () => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game', defaultValue: 'maimai' });

  const { scores, isLoading, mutate } = useScores(game);
  const small = useMediaQuery('(max-width: 30rem)');

  return (
    <Box pt="xl" pb="xl">
      <Title ta="center" order={3} mb={4}>备份成绩</Title>
      <Text fz="sm" ta="center" c="dimmed" mb="lg">导入成绩将会覆盖已有成绩</Text>
      <SimpleGrid cols={small ? 1 : 2} spacing="lg">
        <CardButton
          icon={<IconFileExport size={64} stroke={1.5} />}
          title="导出成绩"
          description="导出成绩到 CSV 文件"
          onClick={() => {
            async function download(type: string) {
              try {
                const res = await fetchAPI(`user/${game}/player/scores/export/${type}`, {
                  method: 'GET',
                });
                if (res.status !== 200) {
                  throw new Error(`HTTP ${res.status}`);
                }
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${game}-scores.${type}`;
                a.click();
              } catch (error) {
                openRetryModal("成绩导出失败", `${error}`, download.bind(null, type));
              }
            }

            download('csv');
          }}
          disabled={isLoading || !scores || scores.length == 0}
        />
        <CardButton
          icon={<IconFileImport size={64} stroke={1.5} />}
          title="导入成绩"
          description="从 CSV 文件导入成绩"
          onClick={
            openConfirmModal.bind(null, "导入成绩", <>
              导入成绩前，建议先备份当前成绩。导入成绩将会<Mark>删除当前所有成绩（包括历史成绩）</Mark>，是否继续？
            </>, () => {
              async function upload() {
                const file = document.createElement('input');
                file.type = 'file';
                file.accept = '.csv';
                file.onchange = async () => {
                  try {
                    if (!file.files || !file.files[0]) return;
                    const formData = new FormData();
                    formData.append('file', file.files[0]);
                    const res = await fetch(`${API_URL}/user/${game}/player/scores/import`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                      },
                      body: formData,
                    });
                    const data = await res.json();
                    if (!data.success) {
                      if (data.code === 400) {
                        openAlertModal("成绩导入失败", `成绩导入失败，无效的 CSV 文件。`);
                        return;
                      }
                      throw new Error(data.message);
                    }
                    openAlertModal("成绩导入成功", `成绩导入成功，你的 ${game === "maimai" ? "DX Rating" : "Rating"} 已自动更新。`);
                    mutate();
                  } catch (error) {
                    openRetryModal("成绩导入失败", `${error}`, upload);
                  }
                };
                file.click();
              }

              upload();
            }, {
              confirmProps: { color: 'red' }
            })
          }
          disabled={isLoading}
        />
      </SimpleGrid>
    </Box>
  );
}