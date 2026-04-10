import { Alert, Button, Card, Group, Switch, Text, TextInput } from "@mantine/core";
import { Icon } from "@/components/MdiIcon";
import { mdiEye, mdiEyeOff, mdiWebOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import { TransformedValues, useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "@/utils/validator";
import { useUpdateUserProfile } from "@/hooks/mutations/useUserMutations.ts";
import classes from "./Profile.module.css";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { useUser } from "@/hooks/queries/useUser.ts";

interface FormValues {
  name: string;
  email: string;
}

export const UserSection = () => {
  const { user, setData } = useUser();
  const [visible, visibleHandler] = useDisclosure(false)

  const { mutate: mutateUpdateProfile } = useUpdateUserProfile();

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
      <Alert radius="md" icon={<Icon path={mdiWebOff} />} title="没有获取到查分器账号数据" color="red">
        <Text size="sm">
          可能是网络连接已断开，请检查你的网络连接是否正常。
        </Text>
      </Alert>
    )
  }

  const updateUserProfileHandler = (values: TransformedValues<typeof form>) => {
    mutateUpdateProfile(values, {
      onSuccess: () => {
        openAlertModal("保存成功", "你的账号详情保存成功。");
        setData((prev) => prev ? {
          ...prev,
          name: form.values.name || prev.name,
          email: form.values.email || prev.email,
        } : prev);
      },
      onError: (error) => {
        openRetryModal("保存失败", `${error}`, () => updateUserProfileHandler(values));
      },
      onSettled: () => {
        form.reset();
      },
    });
  }

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
          placeholder={visible ? user.name : user.name.replace(/./g, '•')}
          {...form.getInputProps('name')}
        />
        <TextInput
          label="邮箱"
          variant="filled"
          placeholder={visible ? user.email : user.email.replace(/./g, '•')}
          {...form.getInputProps('email')}
        />
        <Group justify="flex-end" mt="md">
          <Button color="blue" type="submit" disabled={!form.isDirty()}>保存</Button>
        </Group>
      </form>
    </Card>
  )
}
