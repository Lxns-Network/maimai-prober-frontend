import {
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Image,
  NumberFormatter,
  rem,
  Text, ThemeIcon,
  Title,
  useComputedColorScheme
} from "@mantine/core";
import classes from "../SongDifficulty.module.css";
import { DifficultyProps } from "../../../utils/api/song/chunithm.tsx";
import { ChunithmScoreProps } from "../../Scores/chunithm/Score.tsx";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import { IconStarFilled } from "@tabler/icons-react";

interface SongProps {
  difficulty: DifficultyProps;
  score: ChunithmScoreProps;
  versions: any[];
  onClick: () => void;
}

const WorldsEndSongDifficulty = ({ difficulty, score, versions, onClick }: SongProps) => {
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card className={[classes.scoreCard, classes.scoreWorldsEnd].join(' ')} c="white" pt={5} p="0.5rem" shadow="sm" radius="md" withBorder style={{
      backgroundColor: "rgba(14, 45, 56, 0.95)",
      opacity: computedColorScheme === 'dark' ? 0.8 : 1,
    }} onClick={onClick}>
      <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
        <Text fz="sm" fw={500} style={{ flex: 1 }}>
          WORLD'S END
          <Title component="span" order={3} fw={500} ml="xs">
            {difficulty.kanji}
          </Title>
        </Text>
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
        <Group wrap="nowrap" justify="center" gap={0}>
          {Array.from({ length: difficulty.star }, (_, i) => (
            <ThemeIcon key={i} size={11} variant="subtle" color="yellow">
              <IconStarFilled />
            </ThemeIcon>
          ))}
        </Group>
      </Flex>
      {score ? (
        <Card w="100%" radius="md" p="1rem" pt="xs" pb="xs" style={{ color: "var(--mantine-text-dark)", backgroundColor: "#424242" }}>
          <Group>
            <Image
              src={`/assets/chunithm/music_rank/${score.rank}.webp`}
              w={rem(94)}
            />
            <Box>
              <Text fz="xs" c="dimmed">成绩</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
            </Box>
          </Group>
          <Group mt="xs" gap="sm">
            {score.play_time && (
              <Box mr={16}>
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
        <Divider color="rgb(14, 45, 56)" />
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

export const ChunithmSongDifficulty = ({ difficulty, score, versions, onClick }: SongProps) => {
  if (difficulty.difficulty === 5) {
    return <WorldsEndSongDifficulty difficulty={difficulty} score={score} versions={versions} onClick={onClick} />
  }
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card className={classes.scoreCard} c="white" pt={5} p="0.5rem" shadow="sm" radius="md" withBorder style={{
      border: `2px solid ${getScoreSecondaryColor("chunithm", difficulty.difficulty)}`.replace(")", ", 0.95)"),
      backgroundColor: getScoreCardBackgroundColor("chunithm", difficulty.difficulty).replace(")", ", 0.95)"),
      opacity: computedColorScheme === 'dark' ? 0.8 : 1,
    }} onClick={onClick}>
      <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
        <Text fz="sm" fw={500} style={{ flex: 1 }}>
          {["BASIC", "ADVANCED", "EXPERT", "MASTER", "ULTIMA"][difficulty.difficulty]}
          <Title component="span" order={3} fw={500} ml="xs">
            {difficulty.level_value.toFixed(1)}
          </Title>
        </Text>
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
      </Flex>
      {score ? (
        <Card w="100%" radius="md" p="1rem" pt="xs" pb="xs" style={{ color: "var(--mantine-text-dark)", backgroundColor: "#424242" }}>
          <Group>
            <Image
              src={`/assets/chunithm/music_rank/${score.rank}.webp`}
              w={rem(94)}
            />
            <Box>
              <Text fz="xs" c="dimmed">成绩</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
            </Box>
          </Group>
          <Group mt="xs" gap="sm">
            <Box mr={16}>
              <Text fz="xs" c="dimmed">Rating</Text>
              <Text fz="md">
                {Math.floor(score.rating * 100) / 100}
              </Text>
            </Box>
            {score.play_time && (
              <Box mr={16}>
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
        <Divider color={getScoreSecondaryColor("chunithm", difficulty.difficulty)} />
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