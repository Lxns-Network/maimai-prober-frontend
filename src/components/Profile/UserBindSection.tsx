import { Button, Card, Group, Switch, Text, TextInput } from "@mantine/core";
import { TransformedValues, useForm } from "@mantine/form";
import { updateUserBind } from "@/utils/api/user.ts";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import classes from "./Profile.module.css";
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";
import { useUser } from "@/hooks/swr/useUser.ts";

interface FormValues {
  qq: string | number;
}

export const UserBindSection = () => {
  const { user, mutate } = useUser();
  const [visible, visibleHandler] = useDisclosure(false)

  const form = useForm<FormValues>({
    initialValues: {
      qq: "",
    },

    validate: {
      qq: (value) => /^\d{5,11}$/.test(value as string) ? null : "QQ 号格式不正确",
    },

    transformValues: (values) => ({
      qq: parseInt(values.qq as string),
    })
  });

  const updateUserBindHandler = async (values: TransformedValues<typeof form>) => {
    try {
      const res = await updateUserBind(values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("绑定成功", "第三方开发者将可以通过绑定信息获取你的游戏数据。");
      mutate({ ...user, bind: { ...(user?.bind || {}), qq: values.qq} } as any, false);
    } catch (error) {
      openRetryModal("绑定失败", `${error}`, () => updateUserBindHandler(values));
    } finally {
      form.reset();
    }
  }

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
        <div>
          <Text fz="lg" fw={700}>
            第三方账号绑定
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            绑定第三方账号，第三方开发者将可以通过绑定信息获取你的游戏数据
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
      <form onSubmit={form.onSubmit(updateUserBindHandler)}>
        <TextInput
          label="QQ"
          placeholder={(user?.bind && user?.bind.qq && (visible ? user?.bind.qq.toString() :
            user?.bind.qq.toString().replace(/./g, '•'))) || "请输入你的 QQ 号"}
          variant="filled"
          mb={5}
          {...form.getInputProps('qq')}
        />
        <Group justify="flex-end" mt="md">
          <Button color="blue" type="submit" disabled={!form.isDirty()}>保存</Button>
        </Group>
      </form>
    </Card>
  )
}