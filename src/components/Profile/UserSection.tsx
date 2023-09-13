import {
  Alert,
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

interface UserDataProps {
  name: string;
  email: string;
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
      <TextInput
        label="用户名"
        variant="filled"
        value={visible ? userData.name : userData.name.replace(/./g, '•')}
        mb={5}
        readOnly
      />
      <TextInput
        label="邮箱"
        variant="filled"
        value={visible ? userData.email : userData.email.replace(/./g, '•')}
        readOnly
      />
    </Card>
  )
}