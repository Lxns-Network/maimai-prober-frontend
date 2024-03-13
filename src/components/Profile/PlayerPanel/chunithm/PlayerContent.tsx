import { ChunithmPlayerProps } from "./PlayerPanel.tsx";
import { Avatar, Badge, Divider, Group, NumberFormatter, rem, Text } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { getRatingGradient, getTrophyColor } from "../../../../utils/color.tsx";

export const PlayerContent = ({ player }: { player: ChunithmPlayerProps }) => {
  return (
    <Group wrap="nowrap">
      <Avatar src={player.character ? `https://assets.lxns.net/chunithm/character/${player.character.id}.png!webp` : player.icon_url} size={94} radius="md" style={{
        backgroundSize: "5px 5px",
        backgroundImage: "linear-gradient(-45deg, transparent 45%, rgba(0, 0, 0, 0.2) 45%, rgba(0, 0, 0, 0.2) 55%, transparent 55%)",
      }}>
        <IconPhotoOff />
      </Avatar>
      <div>
        <Group gap="xs" mb={8}>
          <Badge variant="light" radius={rem(10)} color={getTrophyColor(player.trophy.color)} style={{
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
        <Group wrap="nowrap">
          <div>
            <Text fz="xs" c="dimmed">Over Power</Text>
            <Text fz="sm">{(player.over_power || 0).toFixed(2)}
              <Text fz="xs" component="span" ml={4}>({(player.change_over_power || 0).toFixed(2)}%)</Text></Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed">所持金币</Text>
            <Text fz="sm">
              <NumberFormatter value={player.currency || 0} thousandSeparator />
            </Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed">全部金币</Text>
            <Text fz="sm">
              <NumberFormatter value={player.total_currency || 0} thousandSeparator />
            </Text>
          </div>
        </Group>
      </div>
    </Group>
  )
}