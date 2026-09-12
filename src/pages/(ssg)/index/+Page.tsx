import { Anchor, Button, Card, Container, Group, Text, ThemeIcon, Title } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import {
  IconArrowRight,
  IconAward,
  IconChartBar,
  IconCloudUpload,
  IconCode,
  IconDisc,
  IconGavel,
  IconHelp,
  IconMusic,
  IconUsers,
} from "@tabler/icons-react";
import clsx from "clsx";
import { HeroArtwork } from "@/components/Home/HeroArtwork";
import { ChartPreview } from "@/components/Home/ChartPreview";
import { EcosystemCarousel } from "@/components/Home/EcosystemCarousel";
import { ScoreShowcase } from "@/components/Home/ScoreShowcase";
import { Link } from "@/components/Link";
import { Footer } from "@/components/Shell/Footer/Footer";
import { isTokenUndefined } from "@/utils/session";
import classes from "./Home.module.css";

const shortcuts = [
  {
    icon: IconCloudUpload,
    title: "同步游戏数据",
    description: "HTTP 代理成绩同步",
    to: "/sync",
  },
  {
    icon: IconMusic,
    title: "曲目查询",
    description: "曲目与谱面信息",
    to: "/songs",
  },
  {
    icon: IconAward,
    title: "收藏品查询",
    description: "称号等收藏品信息",
    to: "/collections",
  },
  {
    icon: IconHelp,
    title: "帮助文档",
    description: "使用说明与常见问题",
    to: "/docs",
  },
];

export default function Page() {
  const mounted = useMounted();
  const isLoggedIn = mounted && !isTokenUndefined();

  return (
    <>
      <main className={classes.root}>
        <Container size={1200} className={classes.container}>
          <section className={classes.hero} aria-labelledby="home-title">
            <div className={classes.heroCopy}>
              <Title id="home-title" className={classes.title}>
                落雪咖啡屋
                <br />
                <span>maimai DX</span> 查分器
              </Title>
              <Text className={classes.description}>
                一个简单的{" "}
                <Text span inherit fw={700} className={classes.highlight}>
                  舞萌 DX & 中二节奏
                </Text>{" "}
                国服查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API
                接口供开发者获取玩家的成绩数据。
              </Text>
              <Group gap="sm" className={classes.controls}>
                <Button
                  component={Link}
                  to={isLoggedIn ? "/user/profile" : "/register"}
                  size="lg"
                  radius="md"
                >
                  {isLoggedIn ? "管理我的查分器账号" : "注册 maimai DX 查分器账号"}
                </Button>
                <Button
                  component={Link}
                  to={isLoggedIn ? "/docs" : "/login"}
                  size="lg"
                  radius="md"
                  variant="default"
                >
                  {isLoggedIn ? "帮助文档" : "登录"}
                </Button>
              </Group>
            </div>
            <HeroArtwork />
          </section>

          <nav className={classes.shortcuts} aria-label="常用功能">
            {shortcuts.map(({ icon: Icon, title, description, to }) => (
              <Card
                component={Link}
                key={to}
                to={to}
                withBorder
                radius="md"
                className={classes.shortcut}
              >
                <ThemeIcon variant="light" radius="md" className={classes.shortcutIcon}>
                  <Icon size={23} stroke={1.5} aria-hidden />
                </ThemeIcon>
                <span className={classes.shortcutCopy}>
                  <Text component="span" className={classes.shortcutTitle}>
                    {title}
                  </Text>
                  <Text component="span" className={classes.shortcutDescription}>
                    {description}
                  </Text>
                </span>
                <IconArrowRight className={classes.shortcutArrow} size={17} aria-hidden />
              </Card>
            ))}
          </nav>

          <section className={classes.section} aria-labelledby="features-title">
            <div className={classes.sectionHeading}>
              <div>
                <Title order={2} id="features-title" className={classes.sectionTitle}>
                  特色功能
                </Title>
                <Text className={classes.sectionDescription} mt="xs">
                  我们的目标是为玩家提供一个简单、易用的查分器。
                </Text>
              </div>
            </div>

            <div className={classes.features}>
              <Card withBorder className={clsx(classes.feature, classes.scoreFeature)}>
                <span className={classes.featureLabel}>
                  <IconChartBar size={19} aria-hidden /> 游戏成绩
                </span>
                <Title order={3} className={classes.featureTitle}>
                  高效的成绩管理
                </Title>
                <Text className={classes.featureDescription}>
                  maimai DX
                  查分器自带易用的成绩管理页面，采用直观的方式为用户展现他们自己的所有成绩。
                </Text>
                <ScoreShowcase />
                <Anchor
                  component={Link}
                  to="/sync"
                  underline="never"
                  className={classes.featureLink}
                >
                  <Group component="span" gap={8} wrap="nowrap" align="center">
                    <Text span inherit inline>
                      同步游戏数据
                    </Text>
                    <IconArrowRight size={17} aria-hidden />
                  </Group>
                </Anchor>
              </Card>

              <Card withBorder className={clsx(classes.feature, classes.chartFeature)}>
                <div className={classes.featureCopy}>
                  <span className={classes.featureLabel}>
                    <IconDisc size={19} aria-hidden /> 舞萌 DX
                  </span>
                  <Title order={3} className={classes.featureTitle}>
                    谱面预览
                  </Title>
                  <Text className={classes.featureDescription}>
                    在浏览器中查看舞萌 DX 谱面，支持播放、暂停与进度调整。
                  </Text>
                  <Anchor
                    component={Link}
                    to="/songs?game=maimai"
                    underline="never"
                    className={classes.featureLink}
                  >
                    <Group component="span" gap={8} wrap="nowrap" align="center">
                      <Text span inherit inline>
                        曲目查询
                      </Text>
                      <IconArrowRight size={17} aria-hidden />
                    </Group>
                  </Anchor>
                </div>
                <ChartPreview />
              </Card>

              <Card withBorder className={clsx(classes.feature, classes.aliasFeature)}>
                <span className={classes.featureLabel}>
                  <IconGavel size={19} aria-hidden /> 曲目别名
                </span>
                <Title order={3} className={classes.featureTitle}>
                  曲目别名投票
                </Title>
                <Text className={classes.featureDescription}>
                  maimai DX 查分器拥有一套独立的曲目别名系统，玩家可以为曲目投票或提交曲目别名。
                </Text>
                <Anchor
                  component={Link}
                  to={isLoggedIn ? "/alias/vote" : "/login?redirect=%2Falias%2Fvote"}
                  underline="never"
                  className={classes.featureLink}
                >
                  <Group component="span" gap={8} wrap="nowrap" align="center">
                    <Text span inherit inline>
                      参与投票
                    </Text>
                    <IconArrowRight size={17} aria-hidden />
                  </Group>
                </Anchor>
                <span className={classes.aliasDecoration} aria-hidden>
                  # 曲目别名
                </span>
              </Card>
            </div>
          </section>

          <Card
            withBorder
            className={classes.developer}
            component="section"
            aria-labelledby="friends-title"
          >
            <div className={classes.developerIcon} aria-hidden>
              <IconUsers size={30} stroke={1.5} />
            </div>
            <div className={classes.developerCopy}>
              <Title order={2} id="friends-title" className={classes.developerTitle}>
                好友系统与名片
              </Title>
              <Text>
                用查分器用户名添加好友，查看对方的游戏名片，管理好友申请、备注与特别关注。
              </Text>
            </div>
            <Button
              component={Link}
              to={isLoggedIn ? "/friends" : "/login?redirect=%2Ffriends"}
              variant="default"
              radius="md"
              rightSection={<IconArrowRight size={17} aria-hidden />}
            >
              管理好友
            </Button>
          </Card>

          <Card
            withBorder
            className={classes.developer}
            component="section"
            aria-labelledby="developer-title"
          >
            <div className={classes.developerIcon} aria-hidden>
              <IconCode size={30} stroke={1.5} />
            </div>
            <div className={classes.developerCopy}>
              <Title order={2} id="developer-title" className={classes.developerTitle}>
                开发者友好
              </Title>
              <Text>
                我们提供了对开发者友好的 API 接口，开发者可以通过 API 接口获取、管理玩家的游戏数据。
              </Text>
            </div>
            <Button
              component={Link}
              to="/docs/developer-guide"
              variant="default"
              radius="md"
              rightSection={<IconArrowRight size={17} aria-hidden />}
            >
              开发者文档
            </Button>
          </Card>

          <section className={classes.section} aria-labelledby="tools-title">
            <div className={classes.sectionHeading}>
              <div>
                <Title order={2} id="tools-title" className={classes.sectionTitle}>
                  社区项目
                </Title>
                <Text className={classes.sectionDescription} mt="xs">
                  基于 maimai DX 查分器开发的第三方开发者工具。
                </Text>
              </div>
            </div>
            <EcosystemCarousel />
          </section>
        </Container>
      </main>
      <Footer maxWidth={1200} />
    </>
  );
}
