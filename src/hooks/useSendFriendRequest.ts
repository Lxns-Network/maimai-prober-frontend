import { notifications } from "@mantine/notifications";
import { useCreateFriendRequest } from "@/hooks/mutations/useFriendMutations";
import { getFriendErrorMessage } from "@/utils/api/friend";

interface SendFriendRequestCallbacks {
  /** `accepted` 为真表示对方此前也向你发过申请，双方已直接成为好友。 */
  onSuccess?: (accepted: boolean) => void;
  /** 收到已本地化的错误文案，便于调用方回填到表单字段。 */
  onError?: (message: string) => void;
}

/** 按查分器用户名发送好友申请，成功与失败都会自带结果通知。 */
export const useSendFriendRequest = () => {
  const mutation = useCreateFriendRequest();

  const send = (username: string, callbacks?: SendFriendRequestCallbacks) => {
    mutation.mutate(
      { username },
      {
        onSuccess: (data) => {
          const accepted = data?.status === "accepted";
          notifications.show({
            title: accepted ? "已成为好友" : "好友申请已发送",
            message: accepted
              ? `你与「${username}」互相发送了申请，已直接成为好友！`
              : `已向「${username}」发送好友申请，请等待对方同意`,
            color: "green",
          });
          callbacks?.onSuccess?.(accepted);
        },
        onError: (err) => {
          const message = getFriendErrorMessage(err, "发送好友申请失败");
          notifications.show({ title: "申请失败", message, color: "red" });
          callbacks?.onError?.(message);
        },
      },
    );
  };

  return { send, isPending: mutation.isPending };
};
