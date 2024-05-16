import React, { useEffect, useRef } from "react";
import {
  Title,
  Text,
  Image,
  Button,
  Container,
  rem,
  SimpleGrid,
  ThemeIcon,
  Flex,
  Avatar, Card, Center
} from '@mantine/core';
import { Carousel } from "@mantine/carousel";
import { useNavigate } from "react-router-dom";
import { IconChartBar, IconCode, IconGavel, IconHandStop, IconHistory } from "@tabler/icons-react";
import { Footer } from "../../components/Footer.tsx";
import Autoplay from "embla-carousel-autoplay";
import classes from './Home.module.css';

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
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
        {description}
      </Text>
    </div>
  );
}

const features = [
  {
    icon: <IconHandStop stroke={1.5} />,
    title: '易于同步成绩',
    description: '摒弃传统的上传方式，我们使用如今流行的 HTTP 代理上传，方便用户随时随地上传自己的成绩。',
  },
  {
    icon: <IconChartBar stroke={1.5} />,
    title: '高效的成绩管理',
    description: 'maimai DX 查分器自带易用的成绩管理页面，采用直观的方式为用户展现他们自己的所有成绩。',
  },
  {
    icon: <IconHistory stroke={1.5} />,
    title: '历史成绩查询',
    description: '我们会存储玩家上传的所有成绩，玩家可以随时查询自己的历史成绩与 DX Rating 的变化趋势。',
  },
  {
    icon: <IconGavel stroke={1.5} />,
    title: '曲目别名投票',
    description: 'maimai DX 查分器拥有一套独立的曲目别名系统，玩家可以为曲目投票或提交曲目别名。',
  },
  {
    icon: <IconCode stroke={1.5} />,
    title: '开发者友好',
    description: '我们提供了对开发者友好的 API 接口，开发者可以通过 API 接口获取、管理玩家的游戏数据。',
  },
];

export default function Home() {
  const autoplay = useRef(Autoplay({ delay: 2000 }));
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "maimai DX 查分器";
  });

  return (
    <>
      <Container className={classes.root}>
        <Image
          src="/logo.webp"
          alt="落雪咖啡屋 maimai DX 查分器"
          maw={600}
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
          <Text size="lg" c="dimmed" className={classes.description}>
            一个简单的{' '}
            <Text className={classes.highlight} component="span" inherit fw={700}>
              舞萌 DX & 中二节奏
            </Text>{' '}
            国服查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。
          </Text>
        </Container>

        <Container className={classes.controls} p={0}>
          {Boolean(localStorage.getItem("token")) ? <>
            <Button className={classes.control} size="lg" variant="default" c="var(--mantine-color-text)"
                    onClick={() => navigate("/docs")}>
              帮助文档
            </Button>
            <Button className={classes.control} size="lg" variant="default" c="var(--mantine-color-text)"
                    onClick={() => navigate("/user/profile")}>
              管理我的查分器账号
            </Button>
          </> : <>
            <Button className={classes.control} size="lg" variant="default" c="var(--mantine-color-text)"
                    onClick={() => navigate("/login")}>
              登录
            </Button>
            <Button className={classes.control} size="lg"
                    onClick={() => navigate("/register")}>
              注册 maimai DX 查分器账号
            </Button>
          </>}
        </Container>

        <Container className={classes.section} mt={rem(100)} size="lg">
          <Center ta="center" mb={50}>
            <div>
              <Title order={2} mb="xs">特色功能</Title>
              <Text c="dimmed">
                我们的目标是为玩家提供一个简单、易用的查分器。
              </Text>
            </div>
          </Center>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={50}>
            {features.map((feature) => <Feature {...feature} key={feature.title} />)}
          </SimpleGrid>
        </Container>

        <Container className={classes.section} mt={rem(100)}>
          <Center ta="center" mb={50}>
            <div>
              <Title order={2} mb="xs">其他工具</Title>
              <Text c="dimmed">
                基于 maimai DX 查分器开发的第三方开发者工具。
              </Text>
            </div>
          </Center>
          <Carousel
            slideSize={{ base: '100%', sm: '80%' }}
            slideGap="md"
            loop
            plugins={[autoplay.current]}
            onMouseEnter={autoplay.current.stop}
            onMouseLeave={autoplay.current.reset}
          >
            <Carousel.Slide>
              <Card className={classes.adCard} withBorder radius="md" p="xl">
                <Flex className={classes.adCardInner} gap="md">
                  <div style={{ flex: 1 }}>
                    <Title order={2} mb={7}>使用 LxBot 查询成绩</Title>
                    <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
                      你可以通过我们提供的 LxBot QQ 机器人，查询你在 maimai DX 查分器中的{' '}
                      <Text className={classes.highlight} component="span" inherit fw={700}>
                        舞萌 DX & 中二节奏
                      </Text>{' '}游戏数据，使用我们精心设计的图片查询样式。
                    </Text>
                    <Button className={classes.control} variant="default" size="lg" mt="md" onClick={() =>
                      window.open("https://qun.qq.com/qunpro/robot/qunshare?robot_appid=102072150&robot_uin=2854207029", "_blank")
                    }>
                      添加
                    </Button>
                  </div>
                  <Avatar src="./lxbot.webp" h="auto" w={96} radius="md" />
                </Flex>
              </Card>
            </Carousel.Slide>
          </Carousel>
        </Container>
      </Container>
      <Footer />
    </>
  );
}