import { fetchAPI } from "@/utils/api/api.ts";
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { ActionIcon, Menu } from "@mantine/core";
import classes from "./ScoreModalMenu.module.css";
import { IconClearAll, IconDots, IconMusic, IconPlayerPlay, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useFixedGame from "@/hooks/useFixedGame.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import useScoreStore from "@/hooks/useScoreStore.ts";
import { usePlayer } from "@/hooks/swr/usePlayer.ts";
import { MaimaiDifficultyProps } from "@/utils/api/song/maimai";
import { ChunithmDifficultyProps } from "@/utils/api/song/chunithm";

interface ScoreModalActionMenuProps {
  score: MaimaiScoreProps | ChunithmScoreProps;
  difficulty?: MaimaiDifficultyProps | ChunithmDifficultyProps;
  onClose?: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
}

export const ScoreModalMenu = ({ score, difficulty, onClose }: ScoreModalActionMenuProps) => {
  const { openModal: openCreateScoreModal } = useCreateScoreStore();
  const { closeModal: closeScoreModal } = useScoreStore();
  const [params, setParams] = useState(new URLSearchParams());
  const [game] = useFixedGame();
  const navigate = useNavigate();

  const { player } = usePlayer(game);

  const DeletePlayerScoreHandler = async () => {
    try {
      const res = await fetchAPI(`user/${game}/player/score?${params.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("成绩删除成功", "你的成绩已经成功删除。")
      onClose && onClose(score);
    } catch (err) {
      openRetryModal("成绩删除失败", `${err}`, DeletePlayerScoreHandler)
    }
  }

  const DeletePlayerScoresHandler = async () => {
    try {
      const res = await fetchAPI(`user/${game}/player/scores?${params.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("成绩删除成功", "你的所有历史成绩已经成功删除。")
      onClose && onClose(score);
    } catch (err) {
      openRetryModal("成绩删除失败", `${err}`, DeletePlayerScoresHandler)
    }
  }

  const handleChartPreview = (chartId: number, difficulty: number) => {
    const params = new URLSearchParams({
      chart_id: String(chartId),
      difficulty: String(difficulty),
    });
    navigate(`/chart?${params.toString()}`);
  };

  useEffect(() => {
    if (!score) return;

    const params = new URLSearchParams({
      song_id: score.id.toString(),
      level_index: score.level_index.toString()
    });
    if ("type" in score) params.append("song_type", score.type);

    setParams(params);
  }, [score]);

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <ActionIcon className={classes.actionIcon} variant="subtle">
          <IconDots size={18} stroke={1.5} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>更多操作</Menu.Label>
        {"type" in score && (
          <>
            {difficulty && "is_buddy" in difficulty && difficulty.is_buddy ? (
              <Menu.Sub>
                <Menu.Sub.Target>
                  <Menu.Sub.Item leftSection={<IconPlayerPlay size={20} stroke={1.5} />}>谱面预览</Menu.Sub.Item>
                </Menu.Sub.Target>

                <Menu.Sub.Dropdown>
                  <Menu.Item onClick={() => {
                    handleChartPreview(score.id, 0);
                    closeScoreModal();
                  }}>
                    1P 谱面
                  </Menu.Item>
                  <Menu.Item onClick={() => {
                    handleChartPreview(score.id, 1);
                    closeScoreModal();
                  }}>
                    2P 谱面
                  </Menu.Item>
                </Menu.Sub.Dropdown>
              </Menu.Sub>
            ) : (
              <Menu.Item leftSection={<IconPlayerPlay size={20} stroke={1.5} />} onClick={() => {
                const typeOffset = score.type === 'dx' ? 1 : 0;
                handleChartPreview(typeOffset * 10000 + score.id, score.level_index);
                closeScoreModal();
              }}>
                谱面预览
              </Menu.Item>
            )}
          </>
        )}
        <Menu.Item disabled={!player} leftSection={<IconPlus size={20} stroke={1.5} />} onClick={() => {
          onClose && onClose();
          openCreateScoreModal({
            game,
            score,
          });
        }}>
          创建新成绩
        </Menu.Item>
        {location.pathname !== "/songs" && (
          <Menu.Item leftSection={<IconMusic size={20} stroke={1.5} />} onClick={() => {
            navigate(`/songs`, { state: { songId: score.id } });
            closeScoreModal();
          }}>
            查看曲目详情
          </Menu.Item>
        )}

        {score.upload_time && (
          <>
            <Menu.Divider />
            <Menu.Label>敏感操作</Menu.Label>
            <Menu.Item color="red" leftSection={<IconTrash size={20} stroke={1.5} />} onClick={() => {
              openConfirmModal("删除成绩", "你确定要删除该成绩吗？", DeletePlayerScoreHandler, {
                confirmProps: { color: 'red' }
              })
            }}>
              删除该成绩
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconClearAll size={20} stroke={1.5} />} onClick={() => {
              openConfirmModal("删除成绩", "你确定要删除所有历史成绩吗？", DeletePlayerScoresHandler, {
                confirmProps: { color: 'red' }
              })
            }}>
              删除所有历史成绩
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}