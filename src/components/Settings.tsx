import { Title, Text } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import SwitchesCard from "./Layout/SwitchesCard";

const useStyles = createStyles(() => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },
}));

export default function Settings() {
  const { classes } = useStyles();

  return (
    <Container className={classes.root} size={400}>
      <Title
        order={2}
        size="h2"
        weight={900}
        align="center"
        mt="xs"
      >
        查分器账号设置
      </Title>
      <Text
        color="dimmed"
        size="sm"
        align="center"
        mt="sm"
        mb="xl"
      >
        你可以在这里设置你的 maimai DX 查分器账号
      </Text>
      <SwitchesCard title="爬取数据" description="设置每次执行爬取操作时获取的数据" data={[{
        key: "allow_crawl_scores",
        title: "允许爬取谱面成绩",
        description: "关闭后，每次爬取数据时将不会爬取成绩数据。",
      }]}
      />
      <SwitchesCard title="隐私设置" description="将影响第三方开发者访问你的数据" data={[{
        key: "allow_third_party_fetch_player",
        title: "允许访问玩家信息",
        description: "关闭后，第三方开发者将无法通过 API 获取你的玩家信息。",
      }, {
        key: "allow_third_party_fetch_scores",
        title: "允许访问谱面成绩",
        description: "关闭后，第三方开发者将无法通过 API 获取你的谱面成绩。",
      }]}
      />
    </Container>
  );
}