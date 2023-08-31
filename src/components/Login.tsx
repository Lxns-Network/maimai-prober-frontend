import { Title, Card, PasswordInput, TextInput, Text, Group, Anchor, Button } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';

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

export default function Login() {
  const { classes } = useStyles();

  return (
    <Container className={classes.root} size={400}>
      <Title
        order={2}
        size="h2"
        weight={900}
        align="center"
      >
        登录到 maimai DX 查分器
      </Title>
      <Text
        color="dimmed"
        size="sm"
        align="center"
        mt="sm"
        mb="xl"
      >
        请使用 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号
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
        <TextInput label="邮箱" variant="filled" placeholder="你的邮箱" />
        <Group position="apart" mt="md">
          <Text component="label" htmlFor="password" size="sm" weight={500}>
            密码
          </Text>
          <Anchor<'a'>
            href="#"
            onClick={(event) => event.preventDefault()}
            sx={(theme) => ({
              paddingTop: 2,
              color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
              fontWeight: 500,
              fontSize: theme.fontSizes.xs,
            })}
          >
            忘记密码？
          </Anchor>
        </Group>
        <PasswordInput
          id="password"
          variant="filled"
          placeholder="你的密码"
        />
        <Group position="right" mt="xl">
          <Button size="sm" variant="default" color="gray">注册</Button>
          <Button size="sm">登录</Button>
        </Group>
      </Card>
    </Container>
  );
}