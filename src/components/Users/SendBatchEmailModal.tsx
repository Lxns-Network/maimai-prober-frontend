import { useForm } from "@mantine/form";
import { Button, Group, Modal, Text, Textarea, TextInput } from "@mantine/core";
import { UserProps } from "@/pages/admin/Users.tsx";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { sendBatchEmail } from "@/utils/api/user.ts";

export const SendBatchEmailModal = ({ users, opened, close }: { users: UserProps[], opened: boolean, close(): void }) => {
  const form = useForm({
    initialValues: {
      subject: '',
      content: '',
    },

    validate: {
      subject: (value) => (value == "" ? "主题不能为空" : null),
      content: (value) => (value == "" ? "正文不能为空" : null),
    },
  });

  const sendBatchEmailHandler = async (values: any) => {
    try {
      const res = await sendBatchEmail({
        emails: users.map((user) => user.email),
        subject: values.subject,
        content: values.content,
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
    } catch (err) {
      openRetryModal("发送失败", `${err}`, () => sendBatchEmailHandler(values));
    } finally {
      form.reset();
      close();
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="群发邮件" centered>
      <form onSubmit={form.onSubmit((values) => {
        openConfirmModal("确认发送", `确认要向 ${users.length} 名用户发送邮件吗？`, () => sendBatchEmailHandler(values));
      })}>
        <TextInput label="主题" placeholder="请输入主题" mb="xs" {...form.getInputProps("subject")} />
        <Textarea
          autosize
          minRows={2}
          label="正文"
          placeholder="请输入正文"
          mb={4}
          {...form.getInputProps("content")}
        />
        <Text size="xs" c="gray">不支持 HTML 语法，请使用纯文本。</Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>取消</Button>
          <Button color="blue" type="submit">发送</Button>
        </Group>
      </form>
    </Modal>
  )
}