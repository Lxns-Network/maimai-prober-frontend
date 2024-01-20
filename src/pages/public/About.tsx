import { useEffect } from 'react';
import {
  Container,
  Text,
  Title,
  rem,
  Card,
  Stack,
  ThemeIcon,
  Space,
  Image,
  Group,
  ActionIcon, Flex,
} from '@mantine/core';
import Icon from "@mdi/react";
import {mdiAt, mdiGithub, mdiQqchat} from "@mdi/js";
import classes from "./About.module.css";

const ContactIconsList = ({ data = [
  { title: 'GitHub', description: 'Lxns-Network', icon: mdiGithub },
  { title: '邮箱', description: 'i@lxns.net', icon: mdiAt },
  { title: 'QQ 群', description: '597413470 ', icon: mdiQqchat },
]}) => {
  const items = data.map((item) =>(
    <Flex key={item.title} align="center">
      <ThemeIcon mr="md" variant="light" size="lg">
        <Icon path={item.icon} size={1} />
      </ThemeIcon>

      <div>
        <Text size="xs" c="dimmed">
          {item.title}
        </Text>
        <Text>{item.description}</Text>
      </div>
    </Flex>
  ));
  return <Stack>{items}</Stack>;
}

export default function About() {
  useEffect(() => {
    document.title = "关于 | maimai DX 查分器";
  }, []);

  return (
    <Container className={classes.root} size={400}>
      <Image
        src="/favicon.webp"
        alt="落雪咖啡屋 maimai DX 查分器"
        maw={180}
        mx="auto"
        mb="md"
      />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        关于 maimai DX 查分器
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        获取 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器相关信息
      </Text>
      <Card radius="md" p="md" withBorder className={classes.card}>
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text fz="lg" fw={700}>
              简介
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              maimai DX 查分器简介
            </Text>
          </div>
          <ActionIcon variant="default" size="lg" onClick={
            () => window.open("https://github.com/Lxns-Network/maimai-prober-frontend", "_blank")
          }>
            <Icon path={mdiGithub} size={rem(24)} />
          </ActionIcon>
        </Group>
        <Space h="md" />
        <Text fz="sm">
          由 Lxns Network（或称落雪咖啡屋）开发的一个简单的国服 maimai DX 查分器，玩家可以查看并管理自己的成绩，同时也有公共的 API 接口供开发者获取玩家的成绩数据。
        </Text>
      </Card>
      <Space h="md" />
      <Card radius="md" p="md" withBorder className={classes.card}>
        <Text fz="lg" fw={700}>
          联系我们
        </Text>
        <Text fz="xs" c="dimmed" mt={3}>
          反馈 maimai DX 查分器的问题或建议
        </Text>
        <Space h="md" />
        <ContactIconsList />
      </Card>
    </Container>
  );
}
