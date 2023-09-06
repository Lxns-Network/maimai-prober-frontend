import {
  Alert,
  Avatar,
  Badge, Button,
  Card,
  Container,
  createStyles,
  Divider,
  Group,
  Image,
  rem,
  Text,
  Title
} from '@mantine/core';
import {json, useLoaderData, useNavigate} from "react-router-dom";
import { useEffect, useState } from "react";
import { getPlayerData, getProfile } from "../../utils/api/api";
import Icon from "@mdi/react";
import {mdiAlertCircleOutline} from "@mdi/js";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },
}));

const getTrophyColor = (color: string) => {
  if (color == "Bronze") {
    return "orange";
  } else if (color == "Normal") {
    return "gray";
  } else if (color == "Gold") {
    return "yellow";
  }
  return "grape";
}

const getDeluxeRatingGradient = (rating: number) => {
  if (rating < 1000) {
    return { from: "lightblue", to: "lightblue" }
  } else if (rating < 2000) {
    return { from: "blue", to: "blue" };
  } else if (rating < 4000) {
    return { from: "lime", to: "green" };
  } else if (rating < 7000) {
    return { from: "yellow", to: "orange" };
  } else if (rating < 10000) {
    return { from: "lightcoral", to: "red" };
  } else if (rating < 12000) {
    return { from: "mediumorchid", to: "purple" }
  } else if (rating < 13000) {
    return { from: "peru", to: "brown"};
  } else if (rating < 14000) {
    return { from: "lightblue", to: "blue" };
  } else if (rating < 14500) {
    return { from: "gold", to: "goldenrod" };
  } else if (rating < 15000) {
    return { from: "khaki", to: "goldenrod" };
  }
  return { from: "red", to: "green" };
}

interface PlayerDataProps {
  name: string;
  rating: number;
  trophy: {
    name: string;
    color: string;
  };
  icon_url: string;
  course_rank_url: string;
  class_rank_url: string;
}

export default function Profile() {
  const { classes } = useStyles();
  const { userData, playerData } = useLoaderData() as { userData: any, playerData: PlayerDataProps };
  const navigate = useNavigate();

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        账号详情
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        查看你的 maimai DX 查分器账号的详情与游戏数据
      </Text>
      {playerData == null ? (
        <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="没有获取到游戏数据" color="red">
          <Text size="sm" mb="md">
            请检查你的查分器账号是否已经绑定 maimai DX 游戏账号。
          </Text>
          <Group>
            <Button variant="outline" color="red" onClick={() => navigate("/user/settings")}>
              同步游戏数据
            </Button>
          </Group>
        </Alert>
      ) : (
        <Card withBorder radius="md" className={classes.card} mb="md">
          <Group noWrap>
            <Avatar src={playerData.icon_url} size={94} radius="md" />
            <div>
              <Group spacing="xs" mb={8}>
                <Badge color={getTrophyColor(playerData.trophy.color)}>{playerData.trophy.name}</Badge>
                <Badge variant="gradient" gradient={getDeluxeRatingGradient(playerData.rating)}>DX Rating: {playerData.rating}</Badge>
              </Group>
              <Text fz="lg" fw={500}>
                {playerData.name}
              </Text>
              <Divider mt={5} mb={10} variant="dashed" />
              <Group spacing="xs">
                <Image src={playerData.course_rank_url} height={36} width="auto" />
                <Image src={playerData.class_rank_url} height={36} width="auto" />
              </Group>
            </div>
          </Group>
        </Card>
      )}
    </Container>
  );
}

export const profileLoader = async () => {
  if (localStorage.getItem("token") === null) {
    return { data: null };
  }
  const [userData, playerData] = await Promise.all([
    getProfile(),
    getPlayerData(),
  ]);
  return json({ userData, playerData });
}