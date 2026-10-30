import { notifications } from "@mantine/notifications";
import {
  useBlockUser,
  useDeleteFriend,
  useUpdateFriendPreference,
} from "@/hooks/mutations/useFriendMutations";
import { getFriendErrorMessage } from "@/utils/api/friend";
import { openConfirmModal, openFormModal } from "@/utils/modal";
import { FriendItem } from "@/types/friend";

interface FriendActionOptions {
  /** 删除或拉黑成功后调用；好友详情页用它离开已不存在的档案。 */
  onRemoved?: () => void;
}

const notifyError = (title: string, fallback: string) => (err: unknown) =>
  notifications.show({ title, message: getFriendErrorMessage(err, fallback), color: "red" });

/**
 * 好友卡片与好友详情共用的四个操作：备注、特别关注、删除、拉黑。
 * 每个 handler 自带确认弹窗与结果通知，不接收事件参数。
 */
export const useFriendActions = (
  friend: Pick<FriendItem, "user_id" | "username" | "remark" | "is_favorite">,
  options?: FriendActionOptions,
) => {
  const updatePreferenceMutation = useUpdateFriendPreference();
  const deleteFriendMutation = useDeleteFriend();
  const blockUserMutation = useBlockUser();

  const displayName = friend.remark || friend.username;
  const fullName = friend.remark ? `${friend.remark} (${friend.username})` : friend.username;

  const editRemark = () => {
    openFormModal(
      "修改备注",
      `为「${friend.username}」设置备注`,
      {
        label: "备注名称",
        placeholder: "最多 64 个字符，留空则恢复原用户名",
        defaultValue: friend.remark || "",
      },
      (newRemark) => {
        const trimmed = newRemark.trim();
        updatePreferenceMutation.mutate(
          { userId: friend.user_id, remark: trimmed },
          {
            onSuccess: () => {
              notifications.show({
                title: "修改成功",
                message: `已将备注更新为「${trimmed || friend.username}」`,
                color: "green",
              });
            },
            onError: notifyError("修改失败", "修改备注失败"),
          },
        );
      },
    );
  };

  const toggleFavorite = () => {
    const nextFavorite = !friend.is_favorite;
    updatePreferenceMutation.mutate(
      { userId: friend.user_id, is_favorite: nextFavorite },
      {
        onSuccess: () => {
          notifications.show({
            title: nextFavorite ? "已设为特别关注" : "已取消特别关注",
            message: nextFavorite
              ? `已将「${displayName}」设为特别关注`
              : `已取消「${displayName}」的特别关注`,
            color: "green",
          });
        },
        onError: notifyError("操作失败", "更新特别关注状态失败"),
      },
    );
  };

  const remove = () => {
    openConfirmModal(
      "删除好友",
      `确定要删除好友「${fullName}」吗？删除后双方无法再互看谱面成绩。`,
      () => {
        deleteFriendMutation.mutate(
          { userId: friend.user_id },
          {
            onSuccess: () => {
              notifications.show({
                title: "已删除好友",
                message: `已移除好友「${friend.username}」`,
                color: "red",
              });
              options?.onRemoved?.();
            },
            onError: notifyError("删除失败", "删除好友失败"),
          },
        );
      },
      {
        confirmProps: { color: "red" },
        labels: { confirm: "删除", cancel: "取消" },
      },
    );
  };

  const block = () => {
    openConfirmModal(
      "加入黑名单",
      `确定要拉黑「${fullName}」吗？将同时解除好友关系，对方无法再向你发送申请。`,
      () => {
        blockUserMutation.mutate(
          { userId: friend.user_id },
          {
            onSuccess: () => {
              notifications.show({
                title: "已加入黑名单",
                message: `已拉黑用户「${friend.username}」`,
                color: "green",
              });
              options?.onRemoved?.();
            },
            onError: notifyError("拉黑失败", "拉黑用户失败"),
          },
        );
      },
      {
        confirmProps: { color: "red" },
        labels: { confirm: "加入黑名单", cancel: "取消" },
      },
    );
  };

  return { editRemark, toggleFavorite, remove, block };
};
