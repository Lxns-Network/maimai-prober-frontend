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
import {useEffect} from "react";

export interface UserDataProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  bind: UserBindProps;
}

export const UserSection = ({ userData }: { userData: UserDataProps | null }) => {
  const { classes } = useStyles();
  const [visible, visibleHandler] = useDisclosure(false)

  if (userData === null) {
    return (
      <Alert radius="md" icon={<Icon path={mdiWebOff} />} title="没有获取到查分器账号数据" color="red">
        <Text size="sm">
          可能是网络连接已断开，请检查你的网络连接是否正常。
        </Text>
      </Alert>
    )
  }

  useEffect(() => {
    if (visible) {
      form.setValues({
        name: userData.name,
        email: userData.email,
      })
    } else {
      form.setValues({
        name: userData.name.replace(/./g, '•'),
        email: userData.email.replace(/./g, '•'),
      })
    }
  }, [visible])

  const form = useForm({
    initialValues: {
      name: userData.name,
      email: userData.email,
    },

    validate: {
      name: (value) => (validateUserName(value) ? null : "用户名格式不正确"),
      email: (value) => (validateEmail(value) ? null : "邮箱格式不正确"),
    },
  });

  return (
    <Card withBorder radius="md" className={classes.card} mb="md">
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
      <form onSubmit={form.onSubmit(() => {})}>
        <TextInput
          label="用户名"
          variant="filled"
          mb={5}
          readOnly={!visible}
          {...form.getInputProps('name')}
        />
        <TextInput
          label="邮箱"
          variant="filled"
          readOnly={!visible}
          {...form.getInputProps('email')}
        />
        <Group position="right" mt="md">
          <Button color="blue" type="submit" disabled={
            !visible || !form.isDirty()
          }>保存</Button>
        </Group>
      </form>
    </Card>
  )
}