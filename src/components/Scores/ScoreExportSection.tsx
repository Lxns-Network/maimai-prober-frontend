import { MaimaiScoreProps } from "./maimai/Score.tsx";
import { ChunithmScoreProps } from "./chunithm/Score.tsx";
import { useLocalStorage } from "@mantine/hooks";
import { Button, Group, Mark } from "@mantine/core";
import { IconFileExport, IconFileImport } from "@tabler/icons-react";
import { fetchAPI } from "../../utils/api/api.tsx";
import { openAlertModal, openConfirmModal, openRetryModal } from "../../utils/modal.tsx";
import { API_URL } from "../../main.tsx";

export const ScoreExportSection = ({ scores, onImport }: { scores?: (MaimaiScoreProps | ChunithmScoreProps)[], onImport?: () => void }) => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });

  return <Group gap="sm" grow mt="md">
    {scores && scores.length > 0 && (
      <Button
        variant="transparent"
        leftSection={<IconFileExport size={20} />}
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
      >
        导出为 CSV
      </Button>
    )}
    <Button
      variant="transparent"
      leftSection={<IconFileImport size={20} />}
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
                onImport && onImport();
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
    >
      从 CSV 导入
    </Button>
  </Group>
}