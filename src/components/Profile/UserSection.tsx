import {
  Alert,
  Button,
  Card,
  Group,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiEye, mdiEyeOff, mdiWebOff } from "@mdi/js";
import { useStyles } from "./PlayerSection";
import { useDisclosure } from "@mantine/hooks";
import { UserBindProps } from "./UserBindSection";
import { useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "../../utils/validator";
import { updateUserProfile } from "../../utils/api/user.tsx";
import AlertModal from "../AlertModal.tsx";
import useAlert from "../../utils/useAlert.tsx";

export interface UserDataProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  bind: UserBindProps;
}

export const UserSection = ({ userData }: { userData: UserDataProps | null }) => {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [visible, visibleHandler] = useDisclosure(false)

  if (!userData) {
    return (
      <Alert radius="md" icon={<Icon path={mdiWebOff} />} title="没有获取到查分器账号数据" color="red">
        <Text size="sm">
          可能是网络连接已断开，请检查你的网络连接是否正常。
        </Text>
      </Alert>
    )
  }

  const form = useForm({
    initialValues: {
      name: "",
      email: "",
    },

    validate: {
      name: (value) => (value.length === 0 || validateUserName(value) ? null : "用户名格式不正确"),
      email: (value) => (value.length === 0 || validateEmail(value) ? null : "邮箱格式不正确"),
    },
  });

  const updateUserProfileHandler = async () => {
    try {
      const res = await updateUserProfile(form.getTransformedValues())
      const data = await res.json()
      if (data.code === 200) {
        openAlert("保存成功", "你的账号详情保存成功");
        userData.name = form.values.name || userData.name;
        userData.email = form.values.email || userData.email;
      } else {
        openAlert("保存失败", data.message);
      }
    } catch (error) {
      openAlert("保存失败", `${error}`);
    } finally {
      form.reset();
    }
  }

  return (
    <Card withBorder radius="md" className={classes.card} mb="md">
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
      <Group position="apart" noWrap spacing="xl" align="center" mb="md">
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
      <form onSubmit={form.onSubmit(() => updateUserProfileHandler())}>
        <TextInput
          label="用户名"
          variant="filled"
          mb={5}
          placeholder={visible ? userData.name : userData.name.replace(/./g, '•')}
          {...form.getInputProps('name')}
        />
        <TextInput
          label="邮箱"
          variant="filled"
          placeholder={visible ? userData.email : userData.email.replace(/./g, '•')}
          {...form.getInputProps('email')}
        />
        <Group position="right" mt="md">
          <Button color="blue" type="submit" disabled={!form.isDirty()}>保存</Button>
        </Group>
      </form>
    </Card>
  )
}