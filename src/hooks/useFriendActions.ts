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
      "",
      {
        label: "备注",
        placeholder: "最多 64 个字符，留空则清除备注",
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
                message: trimmed ? `已将备注更新为「${trimmed}」` : "已清除备注",
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
        onError: notifyError("操作失败", "更新特别关注状态失败"),
      },
    );
  };

  const remove = () => {
    openConfirmModal(
      "删除好友",
      `确定要删除好友「${fullName}」吗？`,
      () => {
        deleteFriendMutation.mutate(
          { userId: friend.user_id },
          {
            onSuccess: () => {
              notifications.show({
                title: "已删除好友",
                message: `已移除好友「${displayName}」`,
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
      `确定要将「${fullName}」加入黑名单吗？`,
      () => {
        blockUserMutation.mutate(
          { userId: friend.user_id },
          {
            onSuccess: () => {
              notifications.show({
                title: "已加入黑名单",
                message: `已拉黑「${displayName}」`,
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
