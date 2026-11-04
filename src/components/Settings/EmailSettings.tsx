import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  LoadingOverlay,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { Icon } from "@/components/MdiIcon";
import { mdiEye, mdiEyeOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import { TransformedValues, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { validateEmail } from "@/utils/validator";
import { useUpdateUserProfile } from "@/hooks/mutations/useUserMutations.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import { useUser } from "@/hooks/queries/useUser.ts";
import { useEmailVerificationFlow } from "@/hooks/useEmailVerificationFlow.ts";
import classes from "./Settings.module.css";

interface FormValues {
  email: string;
}

export const EmailSettings = () => {
  const { user, isLoading, invalidate } = useUser();
  const [visible, visibleHandler] = useDisclosure(false);

  const { mutate: mutateUpdateProfile, isPending } = useUpdateUserProfile();
  const {
    verificationSent,
    sendVerification: sendEmailVerificationHandler,
    isSending: isSendingEmailVerification,
    checkNow: checkEmailVerification,
    isChecking: isCheckingEmailVerification,
    timedOut: emailVerificationPollingTimedOut,
    resetVerificationSent,
  } = useEmailVerificationFlow({
    verified: user?.email_verified ?? false,
    invalidate,
    verifiedMessage: "当前邮箱已经完成验证。",
  });

  const form = useForm<FormValues>({
    initialValues: {
      email: "",
    },

    validate: {
      email: (value) => validateEmail(value, { allowEmpty: false }),
    },
  });

  const updateEmailHandler = (values: TransformedValues<typeof form>) => {
    mutateUpdateProfile(values, {
      onSuccess: () => {
        notifications.show({
          title: "修改成功",
          message: "你的邮箱已更新。",
          color: "green",
        });
        resetVerificationSent();
        form.reset();
        void invalidate();
      },
      onError: (error) => {
        openRetryModal("修改失败", `${error}`, () => updateEmailHandler(values));
      },
    });
  };

  const email = user?.email ?? "";

  return (
    <Card withBorder radius="md" className={classes.card} mb="md">
      <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
      <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
        <Box>
          <Text fz="lg" fw={700}>
            邮箱管理
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            修改或验证你的查分器账号邮箱
          </Text>
        </Box>
        <Switch
          size="lg"
          aria-label={visible ? "隐藏邮箱" : "显示邮箱"}
          checked={visible}
          onChange={visibleHandler.toggle}
          onLabel={<Icon path={mdiEye} size={0.8} />}
          offLabel={<Icon path={mdiEyeOff} size={0.8} />}
        />
      </Group>
      <form onSubmit={form.onSubmit(updateEmailHandler)}>
        <TextInput
          label={
            <Group gap={6}>
              <Text component="span" size="sm" fw={500}>
                邮箱
              </Text>
              {user && (
                <Badge color={user.email_verified ? "green" : "gray"} variant="light" size="xs">
                  {user.email_verified ? "已验证" : "未验证"}
                </Badge>
              )}
            </Group>
          }
          variant="filled"
          placeholder={visible ? email : email.replace(/./g, "•")}
          {...form.getInputProps("email")}
        />
        {user && !user.email_verified && (
          <Group gap={0} mt={4}>
            <Text size="xs" c="dimmed">
              {form.values.email
                ? "请先保存新的邮箱地址。"
                : verificationSent
                  ? emailVerificationPollingTimedOut
                    ? "自动检查已暂停，可手动检查验证状态。"
                    : "验证邮件已发送，正在等待验证。"
                  : "当前邮箱尚未验证。"}
            </Text>
            {!form.values.email &&
              (verificationSent ? (
                <Button
                  type="button"
                  size="compact-xs"
                  variant="subtle"
                  px={4}
                  loading={isCheckingEmailVerification}
                  onClick={() => void checkEmailVerification()}
                >
                  检查验证状态
                </Button>
              ) : (
                <Button
                  type="button"
                  size="compact-xs"
                  variant="subtle"
                  px={4}
                  loading={isSendingEmailVerification}
                  onClick={sendEmailVerificationHandler}
                >
                  发送验证邮件
                </Button>
              ))}
          </Group>
        )}
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={isPending} disabled={!form.isDirty()}>
            保存
          </Button>
        </Group>
      </form>
    </Card>
  );
};
