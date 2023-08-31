import { Card, PasswordInput, TextInput, Text, Group, Anchor, Button } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';

const useStyles = createStyles(() => ({
  root: {
    paddingTop: rem(80),
    paddingBottom: rem(80),
  },
}));

export default function Login() {
  const { classes } = useStyles();

  return (
    <Container className={classes.root} size={400}>
      <Card
        radius="md"
        shadow="md"
        withBorder
        p="xl"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
        })}
      >
        <Text ta="center" fz={28} fw={700} mb="xl">
          登录到
          <br />
          maimai DX 查分器
        </Text>
        <TextInput label="邮箱" />
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
        <PasswordInput id="password" />
        <Group position="right" mt="xl">
          <Button size="sm" variant="default" color="gray">注册</Button>
          <Button size="sm">登录</Button>
        </Group>
      </Card>
    </Container>
  );
}