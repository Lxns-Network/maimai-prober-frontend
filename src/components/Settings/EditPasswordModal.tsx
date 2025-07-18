import { useForm } from "@mantine/form";
import { validatePassword } from "@/utils/validator.ts";
import { editUserPassword } from "@/utils/api/user.ts";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { Button, Group, Modal, PasswordInput } from "@mantine/core";

interface FormValues {
  current_password: string;
  new_password: string;
  confirm_new_password?: string;
}

export const EditPasswordModal = ({ opened, close }: { opened: boolean, close(): void }) => {
  const form = useForm<FormValues>({
    initialValues: {
      current_password: "",
      new_password: "",
      confirm_new_password: "",
    },

    validate: {
      current_password: (value) => (validatePassword(value) ? null : "原密码格式不正确"),
      new_password: (value) => (validatePassword(value) ? null : "新密码格式不正确"),
      confirm_new_password: (value, values) => (value === values.new_password ? null : "两次输入的新密码不一致"),
    },

    transformValues: (values) => ({
      current_password: values.current_password,
      new_password: values.new_password,
    }),
  });

  const editUserPasswordHandler = async (values: FormValues) => {
    try {
      const res = await editUserPassword(values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("修改成功", "下次登录时请使用新密码。");
    } catch (err) {
      openRetryModal("修改失败", `${err}`, () => editUserPasswordHandler(values));
    } finally {
      close();
    }
  }

  return (
    <Modal opened={opened} onClose={close} onExitTransitionEnd={form.reset} title="修改密码" centered>
      <form onSubmit={form.onSubmit(editUserPasswordHandler)}>
        <PasswordInput label="原密码" placeholder="请输入原密码" mb="xs" {...form.getInputProps("current_password")} />
        <PasswordInput label="新密码" placeholder="请输入新密码" mb="xs" {...form.getInputProps("new_password")} />
        <PasswordInput label="重复密码" placeholder="请再次输入新密码" mb="xs" {...form.getInputProps("confirm_new_password")} />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>取消</Button>
          <Button color="blue" type="submit">保存</Button>
        </Group>
      </form>
    </Modal>
  )
}