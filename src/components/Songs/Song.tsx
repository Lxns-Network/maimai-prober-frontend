import { MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { useLocalStorage } from "@mantine/hooks";
import { Badge, Box, Card, Divider, Flex, Group, Image, NumberFormatter, rem, Text, Title } from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../utils/color.tsx";

interface SongProps {
  song: MaimaiSongProps | ChunithmSongProps;
  difficulty: any;
  type?: string;
  score: any;
  versions: any[];
}

export const Song = ({ song, difficulty, type, score, versions }: SongProps) => {
  const [game] = useLocalStorage({ key: 'game' });

  return (
    <Card key={`${song.id}-${type}-${difficulty.difficulty}`} c="white" pt={5} p="0.5rem" mt="md" radius="md" withBorder style={{
      border: `2px solid ${getScoreSecondaryColor(game, difficulty.difficulty)}`.replace(")", ", 0.95)"),
      backgroundColor: getScoreCardBackgroundColor(game, difficulty.difficulty).replace(")", ", 0.95)"),
    }}>
      <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
        <Text fz="sm" fw={500} style={{ flex: 1 }}>
          {["BASIC", "ADVANCED", "EXPERT", "MASTER", game === "maimai" ? "Re:MASTER" : "ULTIMA"][difficulty.difficulty]}
          <Title component="span" order={3} fw={500} ml="xs">
            {difficulty.level_value.toFixed(1)}
          </Title>
        </Text>
        {game === "maimai" ? (
          <Flex mr="xs">
            <Image
              src={`/assets/maimai/music_icon/${score && score.fc || "blank"}.webp`}
              w={rem(30)}
            />
            <Image
              src={`/assets/maimai/music_icon/${score && score.fs || "blank"}.webp`}
              w={rem(30)}
            />
          </Flex>
        ) : (
          <Flex>
            {score?.clear === "failed" && (
              <Image
                src={`/assets/chunithm/music_icon/failed.webp`}
                w={rem(94)}
              />
            )}
            {score?.clear === "clear" && !score.full_combo && (
              <Image
                src={`/assets/chunithm/music_icon/clear.webp`}
                w={rem(94)}
              />
            )}
            {score?.full_combo && (
              <Image
                src={`/assets/chunithm/music_icon/${score.full_combo}.webp`}
                w={rem(94)}
              />
            )}
            {score?.full_chain && (
              <Image
                src={`/assets/chunithm/music_icon/${score.full_chain}.webp`}
                w={rem(94)}
              />
            )}
          </Flex>
        )}
        {game === "maimai" && (type === "standard" ? (
          <Badge variant="filled" color="blue">标准</Badge>
        ) : (
          <Badge variant="filled" color="orange">DX</Badge>
        ))}
      </Flex>
      {score ? (
        <Card w="100%" radius="md" p="1rem" pt="xs" pb="xs" style={{ color: "var(--mantine-text-dark)", backgroundColor: "#424242" }}>
          <Group>
            <Image
              src={`/assets/${game}/music_rank/${score?.rate || score?.rank}.webp`}
              w={game === "maimai" ? rem(64) : rem(94)}
            />
            {game === "maimai" ? (
              <Box>
                <Text fz="xs" c="dimmed">达成率</Text>
                <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                  {parseInt(String(score.achievements))}
                  <span style={{ fontSize: rem(16) }}>.{
                    (String(score?.achievements).split(".")[1] || "0").padEnd(4, "0")
                  }%</span>
                </Text>
              </Box>
            ) : (
              <Box>
                <Text fz="xs" c="dimmed">成绩</Text>
                <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                  <NumberFormatter value={score.score || 0} thousandSeparator />
                </Text>
              </Box>
            )}
          </Group>
          <Group mt="xs">
            {game === "maimai" ? (
              <Box mr={12}>
                <Text fz="xs" c="dimmed">DX Rating</Text>
                <Text fz="md">
                  {parseInt(String(score.dx_rating))}
                </Text>
              </Box>
            ) : (
              <Box mr={12}>
                <Text fz="xs" c="dimmed">Rating</Text>
                <Text fz="md">
                  {Math.floor(score.rating * 100) / 100}
                </Text>
              </Box>
            )}
            {score.play_time && (
              <Box mr={12}>
                <Text fz="xs" c="dimmed">游玩时间</Text>
                <Text fz="md">
                  {new Date(score.play_time || "").toLocaleString()}
                </Text>
              </Box>
            )}
            <Box>
              <Text fz="xs" c="dimmed">上传时间</Text>
              <Text fz="md">
                {new Date(score.upload_time || "").toLocaleString()}
              </Text>
            </Box>
          </Group>
        </Card>
      ) : (
        <Divider color={getScoreSecondaryColor(game, difficulty.difficulty)} />
      )}
      <Group mt={7} ml="0.5rem" gap="xs">
        {difficulty.note_designer && difficulty.note_designer != "-" && (
          <Group>
            <Text fz="xs">谱师</Text>
            <Text fz="sm" fw={700} mr="md">
              {difficulty.note_designer}
            </Text>
          </Group>
        )}
        <Group>
          <Text fz="xs">版本</Text>
          <Text fz="sm" fw={700}>
            {versions.slice().reverse().find((version) => song.version >= version.version)?.title || "未知"}
          </Text>
        </Group>
      </Group>
    </Card>
  )
}