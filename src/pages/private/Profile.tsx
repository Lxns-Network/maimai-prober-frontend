import { useEffect, useState } from 'react';
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  createStyles,
  Divider,
  Group,
  Image,
  Input,
  InputBase,
  Switch,
  Text,
  Title,
  rem, Loader,
} from '@mantine/core';
import { useNavigate } from "react-router-dom";
import { getPlayerDetail, getProfile } from "../../utils/api/api";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiEye, mdiEyeOff, mdiWebOff } from "@mdi/js";

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
  star: number;
  icon_url: string;
  course_rank_url: string;
  class_rank_url: string;
  upload_time: string;
}

const PlayerSection = ({ playerData }: { playerData: PlayerDataProps | null }) => {
  const { classes } = useStyles();
  const navigate = useNavigate();

  if (playerData === null) {
    return (
      <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="没有获取到游戏数据" color="red" mb="md">
        <Text size="sm" mb="md">
          请检查你的查分器账号是否已经绑定 maimai DX 游戏账号。
        </Text>
        <Group>
          <Button variant="outline" color="red" onClick={() => navigate("/user/settings")}>
            同步游戏数据
          </Button>
        </Group>
      </Alert>
    )
  }

  return (
    <Card withBorder radius="md" className={classes.card} mb="md" p={0}>
      <Group noWrap m="md">
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
          <Group spacing={10}>
            <Image src={playerData.course_rank_url} height={36} width="auto" />
            <Image src={playerData.class_rank_url} height={32} width="auto" />
            <Group spacing={2} ml="xs">
              <Image src="https://maimai.wahlap.com/maimai-mobile/img/icon_star.png" height={28} width="auto" />
              <Text>
                ×{playerData.star}
              </Text>
            </Group>
          </Group>
        </div>
      </Group>
      <Accordion variant="filled" chevronPosition="left" defaultValue="detail">
        <Accordion.Item value="detail">
          <Accordion.Control>详细信息</Accordion.Control>
          <Accordion.Panel>
            <Text size="sm" color="dimmed">
              上次同步时间：{(new Date(Date.parse(playerData.upload_time))).toLocaleString()}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  )
}

interface UserDataProps {
  name: string;
  email: string;
}

const UserSection = ({ userData }: { userData: UserDataProps | null }) => {
  const { classes } = useStyles();
  const [visible, setVisible] = useState(true);

  if (userData === null) {
    return (
      <Alert radius="md" icon={<Icon path={mdiWebOff} />} title="没有获取到查分器账号数据" color="red">
        <Text size="sm">
          可能是网络连接已断开，请检查你的网络连接是否正常。
        </Text>
      </Alert>
    )
  }

  return (
    <Card withBorder radius="md" className={classes.card} mb="md">
      <Group position="apart" noWrap spacing="xl" align="center" mb="md">
        <div>
          <Text fz="lg" fw={700}>
            查分器账号详情
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            查看你的查分器账号的详情
          </Text>
        </div>
        <Switch
          size="md"
          value={visible ? "visible" : "hidden"}
          onClick={() => setVisible(!visible)}
          onLabel={<Icon path={mdiEyeOff} size={0.8} />}
          offLabel={<Icon path={mdiEye} size={0.8} />}
        />
      </Group>
      <InputBase variant="filled" component="button" label="用户名" mb={5}>
        <Input.Placeholder>{
          visible ? userData.name : userData.name.replace(/./g, "•")
        }</Input.Placeholder>
      </InputBase>
      <InputBase variant="filled" component="button" label="邮箱">
        <Input.Placeholder>{
          visible ? userData.email : userData.email.replace(/./g, "•")
        }</Input.Placeholder>
      </InputBase>
    </Card>
  )
}

export default function Profile() {
  const { classes } = useStyles();
  const [playerData, setPlayerData] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getPlayerDetail(), getProfile()]).then((responses) => {
      const [playerResponse, userResponse] = responses;

      if (playerResponse?.status === 200) {
        playerResponse.json().then((data) => {
          setPlayerData(data.data);
        });
      }

      if (userResponse?.status === 200) {
        userResponse.json().then((data) => {
          setUserData(data.data);
        });
      }
      setIsLoaded(true);
    });
  }, []);

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        账号详情
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        查看你的 maimai DX 查分器账号的详情与游戏数据
      </Text>
      {!isLoaded ? (
        <Group position="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <>
          <PlayerSection playerData={playerData} />
          <UserSection userData={userData} />
        </>
      )}
    </Container>
  );
}
