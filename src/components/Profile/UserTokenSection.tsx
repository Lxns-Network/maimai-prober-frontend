import {
  Button, Card, Group, Switch, Text, TextInput, ActionIcon, CopyButton, Tooltip, List, Mark, Paper, rem, Box
} from "@mantine/core";
import { generateUserToken } from "@/utils/api/user.ts";
import Icon from "@mdi/react";
import { mdiAlertCircle, mdiEye, mdiEyeOff, mdiInformation } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import classes from "./Profile.module.css";
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import { useUser } from "@/hooks/swr/useUser.ts";

const GenerateTokenPaper = () => (
  <Paper p="md" withBorder>
    <Text fz="sm" fw={700} mb="sm">注意事项</Text>
    <List size="xs" icon={
      <Box h={18}>
        <Icon color="orange" path={mdiAlertCircle} size={rem(18)} />
      </Box>
    }>
      <List.Item icon={
        <Box h={18}>
          <Icon color="rgb(34,139,230)" path={mdiInformation} size={rem(18)} />
        </Box>
      }>该密钥并不等同于开发者 API 密钥</List.Item>
      <List.Item icon={
        <Box h={18}>
          <Icon color="rgb(34,139,230)" path={mdiInformation} size={rem(18)} />
        </Box>
      }>该密钥对你的查分器用户数据<Mark>没有访问权限</Mark></List.Item>
      <List.Item>该密钥对你查分器账号绑定的游戏数据拥有<Mark>完全访问权限</Mark></List.Item>
      <List.Item>该密钥无视查分器账号的隐私设置</List.Item>
      <List.Item>不要分享该密钥给不信任的第三方</List.Item>
      <List.Item>如果该密钥被泄露，请及时重新生成密钥</List.Item>
    </List>
  </Paper>
)

export const UserTokenSection = () => {
  const { user, mutate } = useUser();
  const [visible, visibleHandler] = useDisclosure(false);

  const generateUserTokenHandler = async () => {
    try {
      const res = await generateUserToken()
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message)
      }
      mutate({ ...user, token: data.data.token } as any, false);
    } catch (error) {
      openRetryModal("生成失败", `${error}`, generateUserTokenHandler);
    }
  }

  if (!user?.token) {
    return (
      <Card withBorder radius="md" className={classes.card}>
        <Group justify="space-between" wrap="nowrap" gap="xl" align="center">
          <div>
            <Text fz="lg" fw={700}>
              个人 API 密钥
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              使用个人 API 访问你的游戏数据
            </Text>
          </div>
          <Button variant="default" size="sm" leftSection={<IconRefresh size={20} />} onClick={() =>
            openConfirmModal("生成个人 API 密钥", <GenerateTokenPaper />, generateUserTokenHandler)} >
            生成 API 密钥
          </Button>
        </Group>
      </Card>
    )
  }

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
        <div>
          <Text fz="lg" fw={700}>
            个人 API 密钥
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            使用个人 API 访问你的游戏数据
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
        variant="filled"
        value={visible ? user?.token : user?.token.replace(/./g, '•')}
        rightSection={
          <CopyButton value={user?.token} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? '已复制' : '复制'} withArrow position="right">
                <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        }
        readOnly
      />
      <Group justify="flex-end" mt="md">
        <Button variant="subtle" size="sm" onClick={() => openAlertModal("注意事项", <GenerateTokenPaper />)}>注意事项</Button>
        <Button variant="default" size="sm" leftSection={<IconRefresh size={20} />} onClick={() =>
          openConfirmModal("重置个人 API 密钥", "你确定要重置密钥吗？这会导致先前使用该密钥的服务失效。", generateUserTokenHandler)} >
          重置 API 密钥
        </Button>
      </Group>
    </Card>
  )
}