import {
  Button,
  Card,
  Group, Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { updateUserBind } from "../../utils/api/user";
import AlertModal from "../AlertModal";
import useAlert from "../../utils/useAlert";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import classes from "./Profile.module.css";

export interface UserBindProps {
  qq?: number;
}

export const UserBindSection = ({ userBind }: { userBind: UserBindProps | null }) => {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [visible, visibleHandler] = useDisclosure(false)

  const form = useForm({
    initialValues: {
      qq: '',
    },

    validate: {
      qq: (value) => /^\d{5,11}$/.test(value) ? null : "QQ 号格式不正确",
    },

    transformValues: (values) => ({
      qq: parseInt(values.qq),
    })
  });

  const updateUserBindHandler = async () => {
    try {
      const res = await updateUserBind(form.getTransformedValues())
      const data = await res.json()
      if (data.code === 200) {
        openAlert("绑定成功", "第三方开发者将可以通过绑定信息获取你的游戏数据");
        userBind = userBind || {}
        userBind.qq = parseInt(form.values.qq)
      } else {
        openAlert("绑定失败", data.message);
      }
    } catch (error) {
      openAlert("绑定失败", `${error}`);
    } finally {
      form.reset();
    }
  }

  return (
    <Card withBorder radius="md" className={classes.card}>
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
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
      <form onSubmit={form.onSubmit(() => {updateUserBindHandler()})}>
        <TextInput
          label="QQ"
          placeholder={(userBind && userBind.qq && (visible ? userBind.qq.toString() :
            userBind.qq.toString().replace(/./g, '•'))) || "请输入你的 QQ 号"}
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