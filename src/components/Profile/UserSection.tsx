import { Alert, Button, Card, Group, Switch, Text, TextInput } from "@mantine/core";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff, mdiWebOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import { TransformedValues, useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "@/utils/validator";
import { updateUserProfile } from "@/utils/api/user.ts";
import classes from "./Profile.module.css";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { useUser } from "@/hooks/swr/useUser.ts";

interface FormValues {
  name: string;
  email: string;
}

export const UserSection = () => {
  const { user } = useUser();
  const [visible, visibleHandler] = useDisclosure(false)

  if (!user) {
    return (
      <Alert radius="md" icon={<Icon path={mdiWebOff} />} title="没有获取到查分器账号数据" color="red" mb="md">
        <Text size="sm">
          可能是网络连接已断开，请检查你的网络连接是否正常。
        </Text>
      </Alert>
    )
  }

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      email: "",
    },

    validate: {
      name: (value) => (value.length === 0 || validateUserName(value) ? null : "用户名格式不正确"),
      email: (value) => (value.length === 0 || validateEmail(value) ? null : "邮箱格式不正确"),
    },
  });

  const updateUserProfileHandler = async (values: TransformedValues<typeof form>) => {
    try {
      const res = await updateUserProfile(values)
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message)
      }
      openAlertModal("保存成功", "你的账号详情保存成功。");
      user.name = form.values.name || user.name;
      user.email = form.values.email || user.email;
    } catch (error) {
      openRetryModal("保存失败", `${error}`, () => updateUserProfileHandler(values))
    } finally {
      form.reset();
    }
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