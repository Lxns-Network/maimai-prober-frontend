import { createStyles, Title, Text, Image, Button, Container, rem, SimpleGrid, ThemeIcon } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import React, { useEffect } from "react";
import Icon from '@mdi/react';
import {
  mdiHandBackRight,
  mdiPoll,
  mdiXml
} from "@mdi/js";

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

  feature: {
    position: 'relative',
  },

  featureTitle: {
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,
  },
}));

interface FeatureProps extends React.ComponentPropsWithoutRef<'div'> {
  path: any;
  title: string;
  description: string;
}

function Feature({ path, title, description, className, ...others }: FeatureProps) {
  const { classes, cx } = useStyles();

  return (
    <div className={cx(classes.feature, className)} {...others}>
      <ThemeIcon variant="gradient" size={40} radius={40}>
        <Icon path={path} size={1} />
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

const mockdata = [
  {
    path: mdiHandBackRight,
    title: '易于使用',
    description:
      '摒弃传统的上传方式，我们使用如今流行的 HTTP 代理上传，方便用户随时随地上传自己的成绩。',
  },
  {
    path: mdiPoll,
    title: '高效的成绩管理',
    description:
      'maimai DX 查分器自带易用的成绩管理页面，采用直观的方式为用户展现他们自己的所有成绩。',
  },
  {
    path: mdiXml,
    title: '开发者友好',
    description:
      '我们提供了对开发者友好的 API 接口，开发者可以通过 API 接口获取、管理玩家的数据。',
  },
];

export default function Home() {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const items = mockdata.map((item) => <Feature {...item} key={item.title} />);

  useEffect(() => {
    document.title = "maimai DX 查分器";
  });

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
        <Text variant="gradient" component="span" inherit>
          maimai
        </Text>{' '}
        DX 查分器
      </Title>

      <Container p={0} size={600}>
        <Text size="lg" color="dimmed" className={classes.description}>
          一个简单的国服 maimai DX 查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。
        </Text>
      </Container>

      {Boolean(localStorage.getItem("token")) ?
        <Container className={classes.controls} p={0}>
          <Button className={classes.control} size="lg" variant="default">
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

      <Container mt={rem(130)} mb={rem(30)} size="lg">
        <SimpleGrid cols={3} breakpoints={[{ maxWidth: 'sm', cols: 1 }]} spacing={50}>
          {items}
        </SimpleGrid>
      </Container>
    </Container>
  );
}