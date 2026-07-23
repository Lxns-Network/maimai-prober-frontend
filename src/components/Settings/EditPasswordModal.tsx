import { useForm } from "@mantine/form";
import { validatePassword } from "@/utils/validator.ts";
import { useEditUserPassword } from "@/hooks/mutations/useUserMutations.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import { notifications } from "@mantine/notifications";
import { Button, Group, Modal, PasswordInput } from "@mantine/core";
import * as Sentry from "@sentry/react";
import { getSentryUser, setAuthToken } from "@/utils/session.ts";

interface FormValues {
  current_password: string;
  new_password: string;
  confirm_new_password?: string;
}

export const EditPasswordModal = ({ opened, close }: { opened: boolean; close(): void }) => {
  const { mutate: mutateEditPassword } = useEditUserPassword();

  const form = useForm<FormValues>({
    initialValues: {
      current_password: "",
      new_password: "",
      confirm_new_password: "",
    },

    validate: {
      current_password: (value) =>
        validatePassword(value, { allowEmpty: false, passwordLabel: "原密码" }),
      new_password: (value) =>
        validatePassword(value, { allowEmpty: false, passwordLabel: "新密码" }),
      confirm_new_password: (value, values) =>
        value === values.new_password ? null : "两次输入的新密码不一致",
    },

    transformValues: (values) => ({
      current_password: values.current_password,
      new_password: values.new_password,
    }),
  });

  const editUserPasswordHandler = (values: FormValues) => {
    mutateEditPassword(values, {
      onSuccess: async (data) => {
        if (data?.token) {
          await setAuthToken(data.token);
          Sentry.setUser(getSentryUser());
        }
        notifications.show({
          title: "修改成功",
          message: "密码已更新。",
          color: "green",
        });
      },
      onError: (err) => {
        openRetryModal("修改失败", `${err}`, () => editUserPasswordHandler(values));
      },
      onSettled: () => {
        close();
      },
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      onExitTransitionEnd={form.reset}
      title="修改密码"
      centered
    >
      <form onSubmit={form.onSubmit(editUserPasswordHandler)}>
        <PasswordInput
          label="原密码"
          placeholder="请输入原密码"
          mb="xs"
          {...form.getInputProps("current_password")}
        />
        <PasswordInput
          label="新密码"
          placeholder="请输入新密码"
          mb="xs"
          {...form.getInputProps("new_password")}
        />
        <PasswordInput
          label="重复密码"
          placeholder="请再次输入新密码"
          mb="xs"
          {...form.getInputProps("confirm_new_password")}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>
            取消
          </Button>
          <Button type="submit">保存</Button>
        </Group>
      </form>
    </Modal>
  );
};
