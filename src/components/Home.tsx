import { createStyles, Title, Text, Image, Button, Container, rem } from '@mantine/core';
import { useNavigate } from "react-router-dom";

const useStyles = createStyles((theme) => ({
  root: {
    position: 'relative',
    paddingTop: rem(80),
    paddingBottom: rem(80),
  },

  title: {
    textAlign: 'center',
    fontWeight: 800,
    fontSize: rem(40),
    letterSpacing: -1,
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,
    marginBottom: theme.spacing.xs,

    [theme.fn.smallerThan('xs')]: {
      fontSize: rem(28),
      textAlign: 'left',
    },
  },

  highlight: {
    color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
  },

  description: {
    textAlign: 'center',

    [theme.fn.smallerThan('xs')]: {
      textAlign: 'left',
      fontSize: theme.fontSizes.md,
    },
  },

  controls: {
    marginTop: theme.spacing.lg,
    display: 'flex',
    justifyContent: 'center',

    [theme.fn.smallerThan('xs')]: {
      flexDirection: 'column',
    },
  },

  control: {
    '&:not(:first-of-type)': {
      marginLeft: theme.spacing.md,
    },

    [theme.fn.smallerThan('xs')]: {
      height: rem(42),
      fontSize: theme.fontSizes.md,

      '&:not(:first-of-type)': {
        marginTop: theme.spacing.md,
        marginLeft: 0,
      },
    },
  },
}));

export default function Home() {
  const { classes } = useStyles();
  const navigate = useNavigate();

  return (
    <Container className={classes.root}>
      <Image
        src="/favicon.ico"
        alt="落雪咖啡屋 maimai DX 查分器"
        maw={240}
        mx="auto"
        mb="md"
      />

      <Title className={classes.title}>
        落雪咖啡屋{' '}
        <Text component="span" className={classes.highlight} inherit>
          maimai
        </Text>{' '}
        DX 查分器
      </Title>

      <Container p={0} size={600}>
        <Text size="lg" color="dimmed" className={classes.description}>
          一个简单的国服 maimai DX 查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。
        </Text>
      </Container>

      <Container className={classes.controls} p={0}>
        <Button
          className={classes.control}
          size="lg"
          variant="default"
          color="gray"
          onClick={() => navigate("/login")}
        >
          登录
        </Button>
        <Button
          className={classes.control}
          size="lg"
          onClick={() => navigate("/register")}
        >
          注册 maimai DX 查分器账号
        </Button>
      </Container>
    </Container>
  );
}