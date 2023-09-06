import { Avatar, Card, Container, createStyles, Group, rem, Text, Title } from '@mantine/core';
import { getProfile } from "../../utils/api/getProfile";
import { useLoaderData } from "react-router-dom";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },
}));

export default function Profile() {
  const { classes } = useStyles();
  const loaderData = useLoaderData();

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        账号详情
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        查看你的 maimai DX 查分器账号的详情与游戏数据
      </Text>
      <Card withBorder radius="md" className={classes.card} mb="md">

        {(loaderData as any).data ? (
          <Group noWrap>
            <Avatar src={null} size={94} radius="md" />
            <div>
              <Text fz="lg" fw={500}>
                {(loaderData as { data?: any }).data.name}
              </Text>
            </div>
          </Group>
        ) : (
          <div>
            <Text fz="lg" fw={500}>
              未登录
            </Text>
          </div>
        )}
      </Card>
    </Container>
  );
}

export function profileLoader() {
  if (localStorage.getItem("token") === null) {
    return { data: null };
  }
  return getProfile();
}