import { useEffect, useState } from "react";
import {
  Title,
  TextInput,
  Text,
  Group,
  Button,
  LoadingOverlay,
  Textarea,
  Card,
  Alert,
} from "@mantine/core";
import { Container, rem } from "@mantine/core";
import { Icon } from "@/components/MdiIcon";
import { mdiCodeTags, mdiLink } from "@mdi/js";
import { IconMail, IconMailCheck } from "@tabler/icons-react";
import { useForm } from "@mantine/form";
import classes from "../Form.module.css";
import { openRetryModal } from "@/utils/modal.tsx";
import { notifications } from "@mantine/notifications";
import { validateText, validateUrl } from "@/utils/validator.ts";
import { useDeveloper } from "@/hooks/queries/useDeveloper.ts";
import { useSendDeveloperApply } from "@/hooks/mutations/useDeveloperMutations.ts";
import { navigate } from "vike/client/router";
import { useUser } from "@/hooks/queries/useUser.ts";
import { useSendEmailVerification } from "@/hooks/mutations/useUserMutations.ts";
import { emailVerificationSentMessage } from "@/utils/emailVerification.ts";
import { useEmailVerificationPolling } from "@/hooks/useEmailVerificationPolling.ts";

interface FormValues {
  name: string;
  url: string;
  reason: string;
}

export default function DeveloperApply() {
  const { developer, isLoading: isDeveloperLoading } = useDeveloper();
  const { user, isLoading: isUserLoading, invalidate: invalidateUser } = useUser();
  const { mutate: sendApply } = useSendDeveloperApply();
  const { mutate: sendEmailVerification, isPending: isSendingEmailVerification } =
    useSendEmailVerification();
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const emailVerificationRequired = !developer && user?.email_verified !== true;
  const showEmailVerificationRequired =
    !isUserLoading && Boolean(user) && emailVerificationRequired;
  const {
    checkNow: checkEmailVerification,
    isChecking: isCheckingEmailVerification,
    timedOut: emailVerificationPollingTimedOut,
  } = useEmailVerificationPolling({
    active: verificationSent,
    verified: user?.email_verified ?? false,
    invalidate: invalidateUser,
  });

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      url: "",
      reason: "",
    },

    validate: {
      name: (value) =>
        validateText(value, {
          allowEmpty: false,
          textLabel: "开发者名称",
          minLength: 4,
          maxLength: 16,
        }),
      url: (value) => validateUrl(value, { allowEmpty: false, urlLabel: "开发者地址" }),
      reason: (value) => validateText(value, { allowEmpty: false, textLabel: "申请理由" }),
    },
  });
  const setFormValues = form.setValues;

  const handleSubmit = (values: FormValues) => {
    setSubmitting(true);

    sendApply(values, {
      onSuccess: () => {
        setApplied(true);
        notifications.show({
          title: "提交成功",
          message: "申请成功，我们将尽快审核您的申请。",
          color: "green",
        });
      },
      onError: (error) => {
        openRetryModal("提交失败", `${error}`, () => handleSubmit(values));
      },
      onSettled: () => {
        setSubmitting(false);
      },
    });
  };

  const sendEmailVerificationHandler = () => {
    sendEmailVerification(undefined, {
      onSuccess: (result) => {
        if (result.email_verified) {
          void invalidateUser();
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

  useEffect(() => {
    if (!developer) return;

    if (developer.api_key) {
      navigate("/developer", { overwriteLastHistoryEntry: true });
    } else {
      setFormValues({
        name: developer.name || "",
        url: developer.url || "",
        reason: developer.reason || "",
      });
      setApplied(true);
    }
  }, [developer, setFormValues]);

  useEffect(() => {
    if (!verificationSent || !user?.email_verified) return;
    setVerificationSent(false);
    notifications.show({
      title: "邮箱验证成功",
      message: "你现在可以提交开发者申请。",
      color: "green",
    });
  }, [user?.email_verified, verificationSent]);

  return (
    <Container className={classes.root} size={420}>
      <Title order={2} size="h2" fw={900} ta="center">
        申请成为开发者
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        提交申请，通过审核后即可获取开发者 API 访问权限
      </Text>
      {showEmailVerificationRequired ? (
        <>
          <Alert
            variant="light"
            icon={<IconMailCheck size={20} stroke={1.5} />}
            title="申请前需要验证邮箱"
            mt="xl"
            radius="md"
          >
            验证邮箱有助于确认联系方式有效，并向你发送申请审核相关通知。
          </Alert>
          <Card className={classes.card} withBorder shadow="md" p={30} mt="md" radius="md">
            <TextInput
              label="邮箱"
              variant="filled"
              value={user?.email ?? ""}
              readOnly
              leftSection={<IconMail size={20} stroke={1.5} />}
            />
            <Text c="dimmed" size="xs" ta="left" mt={4}>
              {verificationSent
                ? emailVerificationPollingTimedOut
                  ? "自动检查已暂停，可手动检查验证状态。"
                  : "验证邮件已发送，正在等待验证。"
                : "验证邮件将发送到当前账号绑定的邮箱。"}
            </Text>
            <Group justify="flex-end" mt="xl">
              <Button
                size="sm"
                variant="default"
                color="gray"
                onClick={() => navigate("/user/profile")}
              >
                账号详情
              </Button>
              <Button
                size="sm"
                loading={
                  verificationSent ? isCheckingEmailVerification : isSendingEmailVerification
                }
                onClick={
                  verificationSent
                    ? () => void checkEmailVerification()
                    : sendEmailVerificationHandler
                }
              >
                {verificationSent ? "检查验证状态" : "发送验证邮件"}
              </Button>
            </Group>
          </Card>
        </>
      ) : (
        <Card className={classes.card} withBorder shadow="md" p={30} mt={30} radius="md">
          <LoadingOverlay
            visible={isDeveloperLoading || isUserLoading}
            overlayProps={{ radius: "sm", blur: 2 }}
            zIndex={2}
          />
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <TextInput
              name="name"
              label="开发者名称"
              variant="filled"
              placeholder="请输入你本人或组织的名称"
              mb="sm"
              leftSection={<Icon path={mdiCodeTags} size={rem(16)} />}
              disabled={applied}
              {...form.getInputProps("name")}
            />
            <TextInput
              name="url"
              label="开发者地址"
              variant="filled"
              placeholder="请输入你本人或组织的地址"
              mb={4}
              leftSection={<Icon path={mdiLink} size={rem(16)} />}
              disabled={applied}
              {...form.getInputProps("url")}
            />
            <Text c="dimmed" size="xs" ta="left" mb="sm">
              可以是个人主页、GitHub 主页或组织主页等
            </Text>
            <Textarea
              name="reason"
              label="申请理由"
              variant="filled"
              placeholder="请输入你的申请理由"
              mb="sm"
              disabled={applied}
              {...form.getInputProps("reason")}
            />
            <Group justify="space-between" mt="xl">
              <div>
                {applied && (
                  <Text size="xs" c="dimmed">
                    你的申请正在受理中
                  </Text>
                )}
              </div>
              <Button size="sm" type="submit" loading={submitting} disabled={applied}>
                提交申请
              </Button>
            </Group>
          </form>
        </Card>
      )}
    </Container>
  );
}
