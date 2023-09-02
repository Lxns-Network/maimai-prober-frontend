import { Title, Card, PasswordInput, TextInput, Text, Group, Anchor, Button } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import {useNavigate} from "react-router-dom";

const useStyles = createStyles((theme) => ({
  root: {
    paddingTop: rem(80),
    paddingBottom: rem(80),
  },

  highlight: {
    position: 'relative',
    backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
    borderRadius: theme.radius.sm,
    padding: `${rem(4)} ${rem(8)}`,
    color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
  },
}));

export default function Register() {
  const { classes } = useStyles();
  const navigate = useNavigate();

  return (
    <Container className={classes.root} size={400}>
      <Title
        order={2}
        size="h2"
        weight={900}
        align="center"
      >
        注册到 maimai DX 查分器
      </Title>
      <Text
        color="dimmed"
        size="sm"
        align="center"
        mt="sm"
        mb="xl"
      >
        创建你的 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号
      </Text>
      <Card
        radius="md"
        shadow="md"
        withBorder
        p="xl"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
        })}
      >
        <TextInput
          label="用户名"
          variant="filled"
          placeholder="请输入你的用户名"
          mb={4}
          required
        />
        <Text
          color="dimmed"
          size="xs"
          align="left"
          mb="sm"
        >
          此用户名将会作为你的 maimai DX 查分器账号的唯一标识，且不会用作查分用途。
        </Text>
        <TextInput
          label="邮箱"
          variant="filled"
          placeholder="请输入你的邮箱"
          mb="sm"
          required
        />
        <PasswordInput
          id="password"
          variant="filled"
          label="密码"
          placeholder="请输入你的密码"
          mb="sm"
          required
        />
        <PasswordInput
          id="confirm-password"
          variant="filled"
          label="确认密码"
          placeholder="请再次输入你的密码"
          mb="sm"
          required
        />
        <Text
          color="dimmed"
          size="xs"
          align="left"
          mt="sm"
        >
          注册即代表你同意我们的服务条款和隐私政策，请在注册后根据指引绑定你的游戏账号。
        </Text>
        <Group position="right" mt="sm">
          <Button
            size="sm"
            variant="default"
            color="gray"
            onClick={() => navigate("/login")}
          >
            登录
          </Button>
          <Button size="sm">注册</Button>
        </Group>
      </Card>
    </Container>
  );
}