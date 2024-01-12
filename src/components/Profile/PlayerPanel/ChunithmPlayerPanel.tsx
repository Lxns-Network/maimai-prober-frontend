import { Avatar, Badge, Divider, Group, rem, Text } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getRatingGradient, getTrophyColor } from "../../../utils/color.tsx";
import { useStyles } from "../PlayerSection.tsx";
import { NotFoundAlert } from "./NotFoundAlert.tsx";

export interface ChunithmPlayerDataProps {
  name: string;
  rating: number;
  friend_code: number;
  trophy: {
    name: string;
    color: string;
  };
  over_power: number;
  change_over_power: number;
  currency: number;
  total_currency: number;
  icon_url: string;
  upload_time: string;
}

export const ChunithmPlayerPanel = ({ player }: { player: ChunithmPlayerDataProps }) => {
  const { classes } = useStyles();

  if (!player) return <NotFoundAlert />;

  return (
    <>
      <Group className={classes.section} noWrap>
        <Avatar src={player.icon_url} size={94} radius="md" style={{
          backgroundSize: "5px 5px",
          backgroundImage: "linear-gradient(-45deg, transparent 45%, rgba(0, 0, 0, 0.2) 45%, rgba(0, 0, 0, 0.2) 55%, transparent 55%)",
        }}>
          <IconPhotoOff />
        </Avatar>
        <div>
          <Group spacing="xs" mb={8}>
            <Badge radius={rem(10)} color={getTrophyColor(player.trophy.color)} style={{
              height: "auto",
            }} children={
              <Text fz="xs" style={{
                whiteSpace: "pre-wrap"
              }}>
                {player.trophy.name}
              </Text>
            } />
            <Badge variant="gradient" gradient={getRatingGradient(player.rating)}>Rating: {player.rating}</Badge>
          </Group>
          <Text fz="lg" fw={500}>
            {player.name}
          </Text>
          <Divider mt={5} mb={10} variant="dashed" />
          <Group>
            <div>
              <Text fz="xs" c="dimmed">Over Power</Text>
              <Text fz="sm">{(player.over_power || 0).toFixed(2)}
                <Text fz="xs" component="span" ml={4}>({(player.change_over_power || 0).toFixed(2)}%)</Text></Text>
            </div>
            <div>
              <Text fz="xs" c="dimmed">所持金币</Text>
              <Text fz="sm">{(player.currency || 0).toLocaleString('en-US', { useGrouping: true })}</Text>
            </div>
            <div>
              <Text fz="xs" c="dimmed">全部金币</Text>
              <Text fz="sm">{(player.total_currency || 0).toLocaleString('en-US', { useGrouping: true })}</Text>
            </div>
          </Group>
        </div>
      </Group>
      <Divider />
      <div className={classes.section}>
        <Group>
          <Text fz="xs" c="dimmed">好友码</Text>
          <Text fz="sm">{player.friend_code}</Text>
        </Group>
        <Group mt="xs">
          <Text fz="xs" c="dimmed">上次同步时间</Text>
          <Text fz="sm">{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Text>
        </Group>
      </div>
    </>
  )
}