import {
  createStyles,
  Title,
  Text,
  Image,
  Button,
  Container,
  rem,
  SimpleGrid,
  ThemeIcon,
  Flex,
  Avatar, Card
} from '@mantine/core';
import { useNavigate } from "react-router-dom";
import React, { useEffect } from "react";
import { IconChartBar, IconCode, IconHandStop } from "@tabler/icons-react";
import { Footer } from "../../components/Footer.tsx";

const useStyles = createStyles((theme) => ({
  root: {
    position: 'relative',
    paddingTop: rem(50),
    paddingBottom: rem(100),
  },

  section: {
    [theme.fn.smallerThan('xs')]: {
      padding: 0,
    },
  },

  logo: {
    opacity: theme.colorScheme === 'dark' ? 0.8 : 1,
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

  description: {
    textAlign: 'center',

    [theme.fn.smallerThan('xs')]: {
      textAlign: 'left',
      fontSize: theme.fontSizes.md,
    },
  },

  highlight: {
    position: 'relative',
    backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
    borderRadius: theme.radius.sm,
    padding: `${rem(4)} ${rem(8)}`,
    color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
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

  featureTitle: {
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,
  },
}));

interface FeatureProps extends React.ComponentPropsWithoutRef<'div'> {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function Feature({ icon, title, description, ...others }: FeatureProps) {
  return (
    <div {...others}>
      <ThemeIcon variant="light" size={40}>
        {icon}
      </ThemeIcon>
      <Text mt="sm" mb={7}>
        {title}
      </Text>
      <Text size="sm" color="dimmed" sx={{ lineHeight: 1.6 }}>
        {description}
      </Text>
    </div>
  );
}

const features = [
  {
    icon: <IconHandStop />,
    title: '易于使用',
    description: '摒弃传统的上传方式，我们使用如今流行的 HTTP 代理上传，方便用户随时随地上传自己的成绩。',
  },
  {
    icon: <IconChartBar />,
    title: '高效的成绩管理',
    description: 'maimai DX 查分器自带易用的成绩管理页面，采用直观的方式为用户展现他们自己的所有成绩。',
  },
  {
    icon: <IconCode />,
    title: '开发者友好',
    description: '我们提供了对开发者友好的 API 接口，开发者可以通过 API 接口获取、管理玩家的数据。',
  },
];

export default function Home() {
  const { classes } = useStyles();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "maimai DX 查分器";
  });

  return (
    <>
      <Container className={classes.root}>
        <Image
          className={classes.logo}
          src="/logo.webp"
          alt="落雪咖啡屋 maimai DX 查分器"
          maw={560}
          mx="auto"
          mb="md"
        />

        <Title className={classes.title}>
          落雪咖啡屋{' '}
          <Text variant="gradient" component="span" inherit>
            maimai
          </Text>{' '}
          DX 查分器
        </Title>

        <Container p={0} size={600}>
          <Text size="lg" color="dimmed" className={classes.description}>
            一个简单的{' '}
            <Text className={classes.highlight} component="span" inherit fw={700}>
              舞萌 DX & 中二节奏
            </Text>{' '}
            国服查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。
          </Text>
        </Container>

        {Boolean(localStorage.getItem("token")) ?
          <Container className={classes.controls} p={0}>
            <Button className={classes.control} size="lg" variant="default"
                    onClick={() => window.open("https://github.com/Lxns-Network/maimai-prober-frontend/wiki", "_blank")}>
              查看文档
            </Button>
            <Button className={classes.control} size="lg" variant="default"
                    onClick={() => navigate("/user/profile")}>
              管理我的查分器账号
            </Button>
          </Container> :
          <Container className={classes.controls} p={0}>
            <Button className={classes.control} size="lg" variant="default"
                    onClick={() => navigate("/login")}>
              登录
            </Button>
            <Button className={classes.control} size="lg" variant="gradient"
                    onClick={() => navigate("/register")}>
              注册 maimai DX 查分器账号
            </Button>
          </Container>
        }

        <Container className={classes.section} mt={rem(100)} size="lg">
          <SimpleGrid cols={3} breakpoints={[{ maxWidth: 'sm', cols: 1 }]} spacing={50}>
            {features.map((feature) => <Feature {...feature} key={feature.title} />)}
          </SimpleGrid>
        </Container>

        <Container className={classes.section} mt={rem(100)}>
          <Card withBorder sx={(theme) => ({
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
            borderRadius: theme.radius.md,
          })} p="xl">
            <Flex align="center" gap="md" sx={(theme) => ({
              [theme.fn.smallerThan('xs')]: {
                flexDirection: "column-reverse",
                alignItems: "flex-start",
              },
            })}>
              <div style={{ flex: 1 }}>
                <Title order={2} mb={7}>使用 LxBot 查询成绩</Title>
                <Text size="sm" color="dimmed" sx={{ lineHeight: 1.6 }}>
                  你可以通过我们提供的 LxBot QQ 机器人，查询你在 maimai DX 查分器中的{' '}
                  <Text className={classes.highlight} component="span" inherit fw={700} style={{ whiteSpace: "nowrap" }}>
                    舞萌 DX & 中二节奏
                  </Text>{' '}游戏数据，使用我们精心设计的图片查询样式。
                </Text>
                <Button className={classes.control} size="lg" mt="md" onClick={
                  () => window.open("https://qun.qq.com/qunpro/robot/qunshare?robot_appid=102072150&robot_uin=2854207029", "_blank")
                }>
                  添加
                </Button>
              </div>
              <Avatar className={classes.logo} src="./lxbot.webp" h="auto" w={96} />
            </Flex>
          </Card>
        </Container>
      </Container>
      <Footer />
    </>
  );
}