import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  createStyles,
  Divider,
  Grid,
  Group,
  Image,
  rem,
  Skeleton,
  Tabs,
  Text
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline } from "@mdi/js";
import {getDeluxeRatingGradient, getRatingGradient, getTrophyColor} from "../../utils/color";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { getPlayerDetail } from "../../utils/api/player.tsx";

interface PlayerDataProps {
  name: string;
  rating: number;
  friend_code: number;
  trophy: {
    name: string;
    color: string;
  };
  star: number;
  icon_url: string;
  course_rank_url: string;
  class_rank_url: string;
  upload_time: string;
  // chunithm
  over_power: number;
  change_over_power: number;
  currency: number;
}

export const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  section: {
    padding: theme.spacing.md,
  },
}));

const NotFoundModal = () => {
  const navigate = useNavigate();

  return (
    <Alert radius={0} icon={<Icon path={mdiAlertCircleOutline} />} title="没有获取到游戏数据" color="red">
      <Text size="sm" mb="md">
        请检查你的查分器账号是否已经绑定游戏账号。
      </Text>
      <Group>
        <Button variant="outline" color="red" onClick={() => navigate("/user/sync")}>
          同步游戏数据
        </Button>
      </Group>
    </Alert>
  )
}

const MaimaiPlayerPanel = ({ playerData }: { playerData: PlayerDataProps | null }) => {
  const { classes } = useStyles();

  if (playerData === null) return <NotFoundModal />;

  return (
    <>
      <Group className={classes.section} noWrap>
        <Avatar src={playerData.icon_url} size={94} radius="md" />
        <div>
          <Group spacing="xs" mb={8}>
            <Badge radius={rem(10)} color={getTrophyColor(playerData.trophy.color)} style={{
              height: "auto",
            }} children={
              <Text fz="xs" style={{
                whiteSpace: "pre-wrap"
              }}>
                {playerData.trophy.name}
              </Text>
            } />
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
      <Divider />
      <div className={classes.section}>
        <Group>
          <Text fz="xs" c="dimmed">好友码</Text>
          <Text fz="sm">{playerData.friend_code}</Text>
        </Group>
        <Group mt="xs">
          <Text fz="xs" c="dimmed">上次同步时间</Text>
          <Text fz="sm">{(new Date(Date.parse(playerData.upload_time))).toLocaleString()}</Text>
        </Group>
      </div>
    </>
  )
}

const ChunithmPlayerPanel = ({ playerData }: { playerData: PlayerDataProps | null }) => {
  const { classes } = useStyles();

  if (playerData === null) return <NotFoundModal />;

  return (
    <>
      <Group className={classes.section} noWrap>
        <Avatar src={playerData.icon_url} size={94} radius="md" />
        <div>
          <Group spacing="xs" mb={8}>
            <Badge radius={rem(10)} color={getTrophyColor(playerData.trophy.color)} style={{
              height: "auto",
            }} children={
              <Text fz="xs" style={{
                whiteSpace: "pre-wrap"
              }}>
                {playerData.trophy.name}
              </Text>
            } />
            <Badge variant="gradient" gradient={getRatingGradient(playerData.rating)}>Rating: {playerData.rating}</Badge>
          </Group>
          <Text fz="lg" fw={500}>
            {playerData.name}
          </Text>
          <Divider mt={5} mb={10} variant="dashed" />
          <Group>
            <Text fz="xs" c="dimmed">Over Power</Text>
            <Text fz="sm">{playerData.over_power} ({playerData.change_over_power}%)</Text>
          </Group>
          <Group>
            <Text fz="xs" c="dimmed">所持金币</Text>
            <Text fz="sm">{playerData.currency}</Text>
          </Group>
        </div>
      </Group>
      <Divider />
      <div className={classes.section}>
        <Group>
          <Text fz="xs" c="dimmed">好友码</Text>
          <Text fz="sm">{playerData.friend_code}</Text>
        </Group>
        <Group mt="xs">
          <Text fz="xs" c="dimmed">上次同步时间</Text>
          <Text fz="sm">{(new Date(Date.parse(playerData.upload_time))).toLocaleString()}</Text>
        </Group>
      </div>
    </>
  )
}

const PlayerPanelSkeleton = () => {
  return (
    <Grid p="md" align="center">
      <Grid.Col span="content">
        <Skeleton h={94} w={94} radius="md" />
      </Grid.Col>
      <Grid.Col span={6}>
        <Skeleton h={16} radius={rem(10)} />
        <Skeleton h={28} mt={12} radius="xl" />
        <Skeleton h={8} mt={12} radius="xl" />
        <Skeleton h={8} mt={8} radius="xl" />
        <Skeleton h={8} mt={8} w="70%" radius="xl" />
      </Grid.Col>
    </Grid>
  )
}

export const PlayerSection = () => {
  const { classes } = useStyles();
  const [playerData, setPlayerData] = useState<PlayerDataProps | null>(null);
  const [fetching, setFetching] = useState(true);
  const [game, setGame] = useLocalStorage({ key: 'game', defaultValue: 'maimai' })

  useEffect(() => {
    async function fetchPlayerData() {
      try {
        const res = await getPlayerDetail(game);
        if (res.status !== 200) {
          return;
        }
        const data = await res.json();
        setPlayerData(data.data);
      } catch (error) {
        console.error(error);
      } finally {
        setFetching(false);
      }
    }

    fetchPlayerData();
  }, [game]);

  return (
    <Card withBorder radius="md" className={classes.card} mb="md" p={0}>
      <Tabs inverted value={game} onTabChange={(value) => {
        if (value === game) return;
        setFetching(true)
        setGame(value as string)
      }}>
        <Tabs.Panel value="maimai">
          {fetching ? (
            <PlayerPanelSkeleton />
          ) : (
            <MaimaiPlayerPanel playerData={playerData} />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="chunithm">
          {fetching ? (
            <PlayerPanelSkeleton />
          ) : (
            <ChunithmPlayerPanel playerData={playerData} />
          )}
        </Tabs.Panel>
        <Tabs.List grow>
          <Tabs.Tab value="maimai">舞萌 DX</Tabs.Tab>
          <Tabs.Tab value="chunithm">中二节奏</Tabs.Tab>
        </Tabs.List>
      </Tabs>
    </Card>
  )
}
