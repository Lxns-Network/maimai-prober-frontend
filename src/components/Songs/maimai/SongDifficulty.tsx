import {
  Badge, Box, Card, Divider, Flex, Group, Image, rem, Text, Title, useComputedColorScheme
} from "@mantine/core";
import classes from "../SongDifficulty.module.css";
import { MaimaiDifficultyProps } from "@/utils/api/song/maimai.ts";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "@/utils/color.ts";
import { MaimaiScoreProps } from "@/types/score";

interface SongProps {
  difficulty: MaimaiDifficultyProps;
  score: MaimaiScoreProps;
  versions: any[];
  onClick: () => void;
}

const UtageSongDifficulty = ({ difficulty, score, versions, onClick }: SongProps) => {
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card className={classes.scoreCard} c="white" mih={82.5} pt={5} p="0.5rem" shadow="sm" radius="md" withBorder style={{
      border: "2px solid rgba(204, 12, 175, 0.95)",
      backgroundColor: "rgba(234, 61, 232, 0.95)",
      opacity: computedColorScheme === 'dark' ? 0.8 : 1,
    }} onClick={onClick}>
      <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
        <Text fz="sm" fw={500} style={{ flex: 1 }}>
          U·TA·GE
          <Title component="span" order={3} fw={500} ml="xs">
            {difficulty.level}
          </Title>
        </Text>
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
        {difficulty.is_buddy && (
          <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">BUDDY</Badge>
        )}
      </Flex>
      {score ? (
        <Card w="100%" radius="md" p="1rem" pt="xs" pb="xs" style={{ color: "var(--mantine-text-dark)", backgroundColor: "#424242" }}>
          <Group>
            <Image
              src={`/assets/maimai/music_rank/${score.rate}.webp`}
              w={rem(64)}
            />
            <Box>
              <Text fz="xs" c="dimmed">达成率</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                {parseInt(String(score.achievements))}
                <span style={{ fontSize: rem(16) }}>.{
                  (String(score?.achievements).split(".")[1] || "0").padEnd(4, "0")
                }%</span>
              </Text>
            </Box>
          </Group>
          <Group mt="xs" gap="sm">
            {score.last_played_time && (
              <Box mr={16}>
                <Text fz="xs" c="dimmed">最后游玩时间</Text>
                <Text fz="md">
                  {new Date(score.last_played_time || "").toLocaleString()}
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
        <Divider color="rgb(204, 12, 175)" />
      )}
      <Flex mt={8} ml="0.5rem" rowGap={4} columnGap="xs" wrap="wrap">
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
            {versions.slice().reverse().find((version) => difficulty.version >= version.version)?.title || "未知"}
          </Text>
        </Group>
      </Flex>
    </Card>
  )
}

export const MaimaiSongDifficulty = ({ difficulty, score, versions, onClick }: SongProps) => {
  if (difficulty.type === "utage") {
    return <UtageSongDifficulty difficulty={difficulty} score={score} versions={versions} onClick={onClick} />
  }
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card className={classes.scoreCard} c="white" mih={82.5} pt={5} p="0.5rem" shadow="sm" radius="md" withBorder style={{
      border: `2px solid ${getScoreSecondaryColor("maimai", difficulty.difficulty)}`.replace(")", ", 0.95)"),
      backgroundColor: getScoreCardBackgroundColor("maimai", difficulty.difficulty).replace(")", ", 0.95)"),
      opacity: computedColorScheme === 'dark' ? 0.8 : 1,
    }} onClick={onClick}>
      <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
        <Text fz="sm" fw={500} style={{ flex: 1 }}>
          {["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"][difficulty.difficulty]}
          <Title component="span" order={3} fw={500} ml="xs">
            {difficulty.level_value.toFixed(1)}
          </Title>
        </Text>
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
        {difficulty.type === "standard" ? (
          <Badge variant="filled" color="blue">标准</Badge>
        ) : (
          <Badge variant="filled" color="orange">DX</Badge>
        )}
      </Flex>
      {score ? (
        <Card w="100%" radius="md" p="1rem" pt="xs" pb="xs" style={{ color: "var(--mantine-text-dark)", backgroundColor: "#424242" }}>
          <Group>
            <Image
              src={`/assets/maimai/music_rank/${score.rate}.webp`}
              w={rem(64)}
            />
            <Box>
              <Text fz="xs" c="dimmed">达成率</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                {parseInt(String(score.achievements))}
                <span style={{ fontSize: rem(16) }}>.{
                  (String(score?.achievements).split(".")[1] || "0").padEnd(4, "0")
                }%</span>
              </Text>
            </Box>
          </Group>
          <Group mt="xs" gap="sm">
            <Box mr={16}>
              <Text fz="xs" c="dimmed">DX Rating</Text>
              <Text fz="md">
                {parseInt(String(score.dx_rating))}
              </Text>
            </Box>
            {score.last_played_time && (
              <Box mr={16}>
                <Text fz="xs" c="dimmed">最后游玩时间</Text>
                <Text fz="md">
                  {new Date(score.last_played_time || "").toLocaleString()}
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
        <Divider color={getScoreSecondaryColor("maimai", difficulty.difficulty)} />
      )}
      <Flex mt={8} ml="0.5rem" rowGap={4} columnGap="xs" wrap="wrap">
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
            {versions.slice().reverse().find((version) => difficulty.version >= version.version)?.title || "未知"}
          </Text>
        </Group>
      </Flex>
    </Card>
  )
}