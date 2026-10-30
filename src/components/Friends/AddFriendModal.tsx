import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconUserPlus } from "@tabler/icons-react";
import { useUser } from "@/hooks/queries/useUser";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import useFriendStore from "@/hooks/useFriendStore";
import { useSendFriendRequest } from "@/hooks/useSendFriendRequest";
import { parseUsernameInput } from "@/utils/profile";
import { validateUserName } from "@/utils/validator";
import { UsernameCopy } from "./UsernameCopy";

interface FormValues {
  username: string;
}

export const AddFriendModal = () => {
  const { addOpened, closeAdd } = useFriendStore();
  const { user } = useUser();
  const { send, isPending } = useSendFriendRequest();

  const form = useForm<FormValues>({
    initialValues: {
      username: "",
    },
    validate: {
      username: (val) => {
        const username = parseUsernameInput(val);
        const error = validateUserName(username, { allowEmpty: false });
        if (error) return error;
        if (user?.name && username.toLowerCase() === user.name.toLowerCase()) {
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
    send(parseUsernameInput(values.username), {
      onSuccess: handleClose,
      onError: (message) => form.setFieldError("username", message),
    });
  };

  return (
    <Modal.Root size="md" opened={addOpened} onClose={handleClose} centered>
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
                label="查分器用户名或好友链接"
                placeholder="输入用户名或粘贴链接（非 15 位好友码）"
                required
                data-autofocus
                disabled={isPending}
                {...form.getInputProps("username")}
              />

              <Text size="xs" c="dimmed">
                申请期间对方可查看你的基本资料，通过后可互看谱面成绩。
              </Text>
              {user?.name && <UsernameCopy username={user.name} size="xs" />}

              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={handleClose} disabled={isPending}>
                  取消
                </Button>
                <Button type="submit" leftSection={<IconUserPlus size={16} />} loading={isPending}>
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
