import { ChunithmScoreProps } from "./Score.tsx";
import { fetchAPI } from "../../../utils/api/api.tsx";
import { openAlertModal, openConfirmModal, openRetryModal } from "../../../utils/modal.tsx";
import { ActionIcon, Menu } from "@mantine/core";
import classes from "../ScoreModalMenu.module.css";
import { IconClearAll, IconDots, IconMusic, IconPlus, IconTrash } from "@tabler/icons-react";
import { useContext } from "react";
import ScoreContext from "../../../utils/context.tsx";
import { useNavigate } from "react-router-dom";

interface ScoreModalActionMenuProps {
  score: ChunithmScoreProps;
  onClose?: (score?: ChunithmScoreProps) => void;
}

export const ChunithmScoreModalMenu = ({ score, onClose }: ScoreModalActionMenuProps) => {
  const navigate = useNavigate();
  const context = useContext(ScoreContext);

  const DeletePlayerScoreHandler = async () => {
    try {
      const res = await fetchAPI(`user/chunithm/player/score?song_id=${score.id}&level_index=${score.level_index}`, {
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
      const res = await fetchAPI(`user/chunithm/player/scores?song_id=${score.id}&level_index=${score.level_index}`, {
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

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <ActionIcon className={classes.actionIcon} variant="subtle">
          <IconDots size={18} stroke={1.5} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>更多操作</Menu.Label>
        <Menu.Item leftSection={<IconPlus size={20} stroke={1.5} />} onClick={() => {
          onClose && onClose();
          if (Object.keys(context).length !== 0) {
            context.setCreateScoreOpened(true);
          } else {
            navigate("/user/scores");
          }
        }}>
          创建新成绩
        </Menu.Item>
        {location.pathname !== "/songs" && (
          <Menu.Item leftSection={<IconMusic size={20} stroke={1.5} />} onClick={() => {
            navigate(`/songs`, { state: { songId: score.id } });
          }}>
            查看曲目详情
          </Menu.Item>
        )}

        {score.score >= 0 && (
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