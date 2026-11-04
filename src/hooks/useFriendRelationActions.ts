import { notifications } from "@mantine/notifications";
import {
  useAcceptFriendRequest,
  useBlockUser,
  useRejectFriendRequest,
  useUnblockUser,
  useWithdrawFriendRequest,
} from "@/hooks/mutations/useFriendMutations";
import { getFriendErrorMessage } from "@/utils/api/friend";
import { openConfirmModal } from "@/utils/modal";

type Notice = { title: string; message: string };

const notifyError = (fallback: string) => (err: unknown) =>
  notifications.show({
    title: "操作失败",
    message: getFriendErrorMessage(err, fallback),
    color: "red",
  });

const notifySuccess = (notice: Notice) => () => notifications.show({ ...notice, color: "green" });

export const useFriendRelationActions = () => {
  const acceptMutation = useAcceptFriendRequest();
  const rejectMutation = useRejectFriendRequest();
  const withdrawMutation = useWithdrawFriendRequest();
  const blockMutation = useBlockUser();
  const unblockMutation = useUnblockUser();

  const accept = (requestId: number, username: string) =>
    acceptMutation.mutate(
      { requestId },
      {
        onSuccess: notifySuccess({
          title: "已同意申请",
          message: `你已与「${username}」成为好友`,
        }),
        onError: notifyError("同意好友申请失败"),
      },
    );

  const reject = (requestId: number, username: string) =>
    openConfirmModal(
      "拒绝好友申请",
      `确定要拒绝「${username}」的好友申请吗？拒绝后对方 7 天内无法再次申请。`,
      () =>
        rejectMutation.mutate(
          { requestId },
          {
            onSuccess: notifySuccess({
              title: "已拒绝申请",
              message: `已拒绝「${username}」的好友申请`,
            }),
            onError: notifyError("拒绝好友申请失败"),
          },
        ),
      {
        confirmProps: { color: "red" },
        labels: { confirm: "拒绝", cancel: "取消" },
      },
    );

  const withdraw = (requestId: number, username: string) =>
    withdrawMutation.mutate(
      { requestId },
      {
        onSuccess: notifySuccess({
          title: "已撤回申请",
          message: `已撤回对「${username}」的好友申请`,
        }),
        onError: notifyError("撤回好友申请失败"),
      },
    );

  /** 拉黑会一并移除双方之间的待处理申请，因此不需要先拒绝。 */
  const rejectAndBlock = (userId: number, username: string) =>
    openConfirmModal(
      "拒绝并加入黑名单",
      `确定要拒绝「${username}」并加入黑名单吗？`,
      () =>
        blockMutation.mutate(
          { userId },
          {
            onSuccess: notifySuccess({
              title: "已加入黑名单",
              message: `已拒绝并拉黑「${username}」`,
            }),
            onError: notifyError("拉黑用户失败"),
          },
        ),
      {
        confirmProps: { color: "red" },
        labels: { confirm: "加入黑名单", cancel: "取消" },
      },
    );

  const unblock = (userId: number, username: string) =>
    openConfirmModal(
      "解除拉黑",
      `确定要将「${username}」移出黑名单吗？`,
      () =>
        unblockMutation.mutate(
          { userId },
          {
            onSuccess: notifySuccess({
              title: "已解除拉黑",
              message: `已将「${username}」移出黑名单`,
            }),
            onError: notifyError("解除拉黑失败"),
          },
        ),
      { labels: { confirm: "解除拉黑", cancel: "取消" } },
    );

  const pendingId = <V>(
    mutation: { isPending: boolean; variables?: V },
    pick: (variables: V) => number,
  ) => (mutation.isPending && mutation.variables ? pick(mutation.variables) : undefined);

  return {
    accept,
    reject,
    withdraw,
    rejectAndBlock,
    unblock,
    pendingAcceptId: pendingId(acceptMutation, (v) => v.requestId),
    pendingRejectId: pendingId(rejectMutation, (v) => v.requestId),
    pendingWithdrawId: pendingId(withdrawMutation, (v) => v.requestId),
    pendingBlockId: pendingId(blockMutation, (v) => v.userId),
    pendingUnblockId: pendingId(unblockMutation, (v) => v.userId),
  };
};
