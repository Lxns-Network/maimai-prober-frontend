import { useNavigate } from "react-router-dom";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  createStyles,
  Divider,
  Group,
  Image,
  rem,
  Text
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline } from "@mdi/js";
import { getDeluxeRatingGradient, getTrophyColor } from "../../utils/color";

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
}

export const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  section: {
    borderBottom: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
    }`,
    padding: theme.spacing.md,
  },
}));

export const PlayerSection = ({ playerData }: { playerData: PlayerDataProps | null }) => {
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
    <Card withBorder radius="md" className={classes.card} mb="md">
      <Card.Section className={classes.section}>
        <Group noWrap>
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
      </Card.Section>

      <Card.Section className={classes.section}>
        <Group>
          <Text fz="xs" c="dimmed">好友码</Text>
          <Text fz="sm">{playerData.friend_code}</Text>
        </Group>
        <Group mt="xs">
          <Text fz="xs" c="dimmed">上次同步时间</Text>
          <Text fz="sm">{(new Date(Date.parse(playerData.upload_time))).toLocaleString()}</Text>
        </Group>
      </Card.Section>
    </Card>
  )
}
