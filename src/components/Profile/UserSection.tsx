import { Alert, Badge, Button, Card, Group, Switch, Text, TextInput } from "@mantine/core";
import { Icon } from "@/components/MdiIcon";
import { mdiEye, mdiEyeOff, mdiWebOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import { TransformedValues, useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "@/utils/validator";
import {
  useSendEmailVerification,
  useUpdateUserProfile,
} from "@/hooks/mutations/useUserMutations.ts";
import classes from "./Profile.module.css";
import { openRetryModal } from "@/utils/modal.tsx";
import { notifications } from "@mantine/notifications";
import { useUser } from "@/hooks/queries/useUser.ts";
import { useEffect, useState } from "react";
import { emailVerificationSentMessage } from "@/utils/emailVerification.ts";
import { useEmailVerificationPolling } from "@/hooks/useEmailVerificationPolling.ts";

interface FormValues {
  name: string;
  email: string;
}

export const UserSection = () => {
  const { user, invalidate } = useUser();
  const [visible, visibleHandler] = useDisclosure(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const { mutate: mutateUpdateProfile } = useUpdateUserProfile();
  const { mutate: sendEmailVerification, isPending: isSendingEmailVerification } =
    useSendEmailVerification();
  const {
    checkNow: checkEmailVerification,
    isChecking: isCheckingEmailVerification,
    timedOut: emailVerificationPollingTimedOut,
  } = useEmailVerificationPolling({
    active: verificationSent,
    verified: user?.email_verified ?? false,
    invalidate,
  });

  useEffect(() => {
    if (!verificationSent || !user?.email_verified) return;
    setVerificationSent(false);
    notifications.show({
      title: "邮箱验证成功",
      message: "当前邮箱已经完成验证。",
      color: "green",
    });
  }, [user?.email_verified, verificationSent]);

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      email: "",
    },

    validate: {
      name: (value) => validateUserName(value, { allowEmpty: true }),
      email: (value) => validateEmail(value, { allowEmpty: true }),
    },
  });

  if (!user) {
    return (
      <Alert
        radius="md"
        icon={<Icon path={mdiWebOff} />}
        title="没有获取到查分器账号数据"
        color="red"
      >
        <Text size="sm">可能是网络连接已断开，请检查你的网络连接是否正常。</Text>
      </Alert>
    );
  }

  const updateUserProfileHandler = (values: TransformedValues<typeof form>) => {
    mutateUpdateProfile(values, {
      onSuccess: () => {
        notifications.show({
          title: "保存成功",
          message: "你的账号详情保存成功。",
          color: "green",
        });
        setVerificationSent(false);
        void invalidate();
      },
      onError: (error) => {
        openRetryModal("保存失败", `${error}`, () => updateUserProfileHandler(values));
      },
      onSettled: () => {
        form.reset();
      },
    });
  };

  const sendEmailVerificationHandler = () => {
    sendEmailVerification(undefined, {
      onSuccess: (result) => {
        if (result.email_verified) {
          void invalidate();
          notifications.show({
            title: "邮箱已验证",
            message: "当前邮箱已经完成验证。",
            color: "green",
          });
          return;
        }
        notifications.show({
          title: "验证邮件已发送",
          message: emailVerificationSentMessage(result.expires_in),
          color: "green",
        });
        setVerificationSent(true);
      },
      onError: (error) => {
        openRetryModal("发送失败", `${error}`, sendEmailVerificationHandler);
      },
    });
  };

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
        <div>
          <Text fz="lg" fw={700}>
            我的账号详情
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            查看你的查分器账号的详情
          </Text>
        </div>
        <Switch
          size="lg"
          value={visible ? "visible" : "hidden"}
          onClick={visibleHandler.toggle}
          onLabel={<Icon path={mdiEye} size={0.8} />}
          offLabel={<Icon path={mdiEyeOff} size={0.8} />}
        />
      </Group>
      <form onSubmit={form.onSubmit(updateUserProfileHandler)}>
        <TextInput
          label="用户名"
          variant="filled"
          mb={5}
          placeholder={visible ? user.name : user.name.replace(/./g, "•")}
          {...form.getInputProps("name")}
        />
        <TextInput
          label={
            <Group gap={6}>
              <Text component="span" size="sm" fw={500}>
                邮箱
              </Text>
              <Badge color={user.email_verified ? "green" : "gray"} variant="light" size="xs">
                {user.email_verified ? "已验证" : "未验证"}
              </Badge>
            </Group>
          }
          variant="filled"
          placeholder={visible ? user.email : user.email.replace(/./g, "•")}
          {...form.getInputProps("email")}
        />
        {!user.email_verified && (
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
          <Button type="submit" disabled={!form.isDirty()}>
            保存
          </Button>
        </Group>
      </form>
    </Card>
  );
};
