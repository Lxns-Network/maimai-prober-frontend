import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconUserPlus } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useCreateFriendRequest } from "@/hooks/mutations/useFriendMutations";
import { useUser } from "@/hooks/queries/useUser";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import useFriendStore from "@/hooks/useFriendStore";
import { getFriendErrorMessage } from "@/utils/api/friend";
import { validateUserName } from "@/utils/validator";
import { UsernameCopy } from "./UsernameCopy";

interface FormValues {
  username: string;
}

export const AddFriendModal = () => {
  const { addOpened, closeAdd } = useFriendStore();
  const { user } = useUser();
  const small = useMediaQuery("(max-width: 30rem)");
  const createRequestMutation = useCreateFriendRequest();

  const form = useForm<FormValues>({
    initialValues: {
      username: "",
    },
    validate: {
      username: (val) => {
        const error = validateUserName(val.trim(), { allowEmpty: false });
        if (error) return error;
        if (user?.name && val.trim().toLowerCase() === user.name.toLowerCase()) {
          return "不能添加自己为好友";
        }
        return null;
      },
    },
  });

  const handleClose = () => {
    form.reset();
    closeAdd();
  };

  useBackDismiss(addOpened, handleClose);

  const handleSubmit = (values: FormValues) => {
    const targetUsername = values.username.trim();
    createRequestMutation.mutate(
      { username: targetUsername },
      {
        onSuccess: (data) => {
          const isAccepted = data?.status === "accepted";
          notifications.show({
            title: isAccepted ? "已成为好友" : "好友申请已发送",
            message: isAccepted
              ? `你与「${targetUsername}」已互相发送申请，已直接成为好友！`
              : `已向「${targetUsername}」发送好友申请，请等待对方同意`,
            color: "green",
          });
          handleClose();
        },
        onError: (err) => {
          const errorMsg = getFriendErrorMessage(err, "发送好友申请失败");
          notifications.show({
            title: "申请失败",
            message: errorMsg,
            color: "red",
          });
          form.setFieldError("username", errorMsg);
        },
      },
    );
  };

  return (
    <Modal.Root size="md" opened={addOpened} onClose={handleClose} fullScreen={small} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>添加好友</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>

        <Modal.Body>
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="sm">
              <TextInput
                label="对方的查分器用户名"
                placeholder="查分器用户名，非游戏内 15 位好友码"
                required
                data-autofocus
                disabled={createRequestMutation.isPending}
                {...form.getInputProps("username")}
              />

              {user?.name && <UsernameCopy username={user.name} size="xs" />}

              <Group justify="flex-end" mt="md">
                <Button
                  variant="default"
                  onClick={handleClose}
                  disabled={createRequestMutation.isPending}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  leftSection={<IconUserPlus size={16} />}
                  loading={createRequestMutation.isPending}
                >
                  发送申请
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
