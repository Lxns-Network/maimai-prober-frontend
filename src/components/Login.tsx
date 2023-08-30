import { Paper, PasswordInput, TextInput, Text, Group, Anchor, Button } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';

const useStyles = createStyles((theme) => ({
  root: {
    paddingTop: rem(80),
    paddingBottom: rem(80),
  },

  inner: {
    position: 'relative',
  },

  content: {
    paddingTop: rem(220),
    position: 'relative',
    zIndex: 1,

    [theme.fn.smallerThan('sm')]: {
      paddingTop: rem(120),
    },
  },

  title: {
    fontFamily: `Greycliff CF, ${theme.fontFamily}`,
    textAlign: 'center',
    fontWeight: 900,
    fontSize: rem(38),

    [theme.fn.smallerThan('sm')]: {
      fontSize: rem(32),
    },
  },

  description: {
    maxWidth: rem(540),
    margin: 'auto',
    marginTop: theme.spacing.xl,
    marginBottom: `calc(${theme.spacing.xl} * 1.5)`,
  },
}));

export default function Login() {
  const { classes } = useStyles();

  return (
    <Container className={classes.root} size={400}>
      <Paper
        radius="md"
        withBorder
        p="lg"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
        })}
      >
        <Text ta="center" fz={28} fw={700} mb="lg">
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
        <Group position="center" mt="lg">
          <Button size="sm" variant="default" color="gray">注册</Button>
          <Button size="sm">登录</Button>
        </Group>
      </Paper>
    </Container>
  );
}