import {useNavigate} from "react-router-dom";
import {Accordion, Alert, Avatar, Badge, Button, Card, createStyles, Divider, Group, Image, Text} from "@mantine/core";
import Icon from "@mdi/react";
import {mdiAlertCircleOutline} from "@mdi/js";
import {getDeluxeRatingGradient, getTrophyColor} from "../../utils/color";

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

export const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
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
