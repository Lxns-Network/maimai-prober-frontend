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

/**
 * 好友卡片与好友详情共用的四个操作：备注、特别关注、删除、拉黑。
 * 每个 handler 自带确认弹窗与结果通知，不接收事件参数。
 */
export const useFriendActions = (friend: FriendItem, options?: FriendActionOptions) => {
  const updatePreferenceMutation = useUpdateFriendPreference();
  const deleteFriendMutation = useDeleteFriend();
  const blockUserMutation = useBlockUser();

  const displayName = friend.remark || friend.username;
  const fullName = friend.remark ? `${friend.remark} (${friend.username})` : friend.username;

  const editRemark = () => {
    openFormModal(
      "修改好友备注",
      `为用户「${friend.username}」设置一个自定义备注名称`,
      {
        label: "备注名称",
        placeholder: "例如：机厅好友、音游搭子（最多 64 字符）",
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
            onError: (err) => {
              notifications.show({
                title: "修改失败",
                message: getFriendErrorMessage(err, "修改备注失败"),
                color: "red",
              });
            },
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
        onError: (err) => {
          notifications.show({
            title: "操作失败",
            message: getFriendErrorMessage(err, "更新特别关注状态失败"),
            color: "red",
          });
        },
      },
    );
  };

  const remove = () => {
    openConfirmModal(
      "删除好友",
      `确定要将「${fullName}」从好友列表中删除吗？删除后双方将无法查看彼此的好友数据。`,
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
            onError: (err) => {
              notifications.show({
                title: "删除失败",
                message: getFriendErrorMessage(err, "删除好友失败"),
                color: "red",
              });
            },
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
      `确定要将「${fullName}」加入黑名单吗？将同时解除好友关系，且对方无法再向你发送好友申请。`,
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
            onError: (err) => {
              notifications.show({
                title: "拉黑失败",
                message: getFriendErrorMessage(err, "拉黑用户失败"),
                color: "red",
              });
            },
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
