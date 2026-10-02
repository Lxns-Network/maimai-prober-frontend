import { useState } from "react";
import { Alert, Button, Checkbox, Group, Modal, Stack, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { rejectDeveloperApplication } from "@/utils/api/developer.ts";

const rejectionReasons = [
  {
    value: "insufficient_reason",
    label: "申请理由不充分",
    description: "请详细说明申请开发者权限的原因及具体的 API 使用需求。",
  },
  {
    value: "invalid_developer_url",
    label: "开发者地址填写不实",
    description: "请填写真实、有效且与你或申请项目相关的开发者地址。",
  },
];

function getRejectionReason(values: { selection: string[]; other: string }) {
  const reasons = rejectionReasons
    .filter(({ value }) => values.selection.includes(value))
    .map(({ label, description }) => `${label}：${description}`);
  if (values.selection.includes("other") && values.other.trim()) reasons.push(values.other.trim());
  return reasons.join("\n");
}

export function RejectDeveloperModal({
  developer,
  opened,
  onClose,
  onRejected,
}: {
  developer: { id: number } | null;
  opened: boolean;
  onClose(): void;
  onRejected(): void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { selection: [] as string[], other: "" },
    validate: {
      selection: (value) => (value.length ? null : "请选择拒绝理由"),
      other: (value, values) => {
        if (!values.selection.includes("other")) return null;
        if (!value.trim()) return "请输入拒绝理由";
        if (Array.from(getRejectionReason(values)).length > 1000)
          return "拒绝理由合计不能超过 1000 字";
        return null;
      },
    },
    transformValues: (values) => ({ reason: getRejectionReason(values) }),
  });
  const close = () => {
    if (!submitting) onClose();
  };
  useBackDismiss(opened, close);

  const submit = async ({ reason }: { reason: string }) => {
    if (!opened || !developer || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await rejectDeveloperApplication(developer.id, reason.trim());
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(result.message || "撤销失败，请稍后重试");
      const emailQueued = result.data?.email_queued === true;
      const notificationCreated = result.data?.notification_created === true;
      notifications.show({
        title: "开发者申请已撤销",
        message: notificationCreated
          ? emailQueued
            ? "已发送站内通知，拒绝理由也将通过邮件发送给申请人。"
            : "站内通知已发送，但邮件发送失败。"
          : emailQueued
            ? "拒绝理由将通过邮件发送，站内通知发送失败。"
            : "站内通知和邮件均发送失败，请手动联系申请人。",
        color: emailQueued && notificationCreated ? "green" : "orange",
      });
      onRejected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      onExitTransitionEnd={() => {
        form.reset();
        setError(null);
      }}
      title="撤销开发者申请"
      centered
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      withCloseButton={!submitting}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack>
          <Checkbox.Group label="拒绝理由" withAsterisk {...form.getInputProps("selection")}>
            <Stack gap="sm" mt="xs">
              {rejectionReasons.map((reason) => (
                <Checkbox key={reason.value} {...reason} disabled={submitting} />
              ))}
              <Stack gap="xs">
                <Checkbox value="other" label="其他" disabled={submitting} />
                <Textarea
                  ml="xl"
                  aria-label="其他拒绝理由"
                  placeholder="请输入拒绝理由"
                  autosize
                  minRows={3}
                  maxRows={8}
                  disabled={submitting || !form.values.selection.includes("other")}
                  {...form.getInputProps("other")}
                  error={form.values.selection.includes("other") ? form.errors.other : undefined}
                />
              </Stack>
            </Stack>
          </Checkbox.Group>
          {error && <Alert color="red">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" color="red" loading={submitting}>
              撤销并通知
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
