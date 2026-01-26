import {
  ActionIcon, Badge, Box, Button, Card, Divider, Flex, Group, Image, Modal, rem, Text, Title, Tooltip, useComputedColorScheme
} from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import classes from "../SongDifficulty.module.css";
import { MaimaiDifficultyProps, MaimaiVersionProps } from "@/utils/api/song/maimai.ts";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "@/utils/color.ts";
import { MaimaiScoreProps } from "@/types/score";
import { useState } from "react";

interface SongDifficultyProps {
  difficulty: MaimaiDifficultyProps;
  score: MaimaiScoreProps;
  songId: number;
  versions: MaimaiVersionProps[];
  onClick: () => void;
}

export const MaimaiSongDifficulty = ({ difficulty, score, songId, versions, onClick }: SongDifficultyProps) => {
  const [buddyMenuOpened, setBuddyMenuOpened] = useState(false);
  const computedColorScheme = useComputedColorScheme('light');
  const navigate = useNavigate();

  const handleChartPreview = (chartId: number, difficulty: number) => {
    const params = new URLSearchParams({
      chart_id: String(chartId),
      difficulty: String(difficulty),
    });
    navigate(`/chart?${params.toString()}`);
  };

  const isUtage = difficulty.type === "utage";
  const colorIndex = isUtage ? 5 : difficulty.difficulty;

  return (
    <>
      <Modal
        title="选择预览谱面"
        centered
        opened={buddyMenuOpened}
        onClose={() => setBuddyMenuOpened(false)}
      >
        <Group grow>
          <Button variant="default" onClick={() => {
            setBuddyMenuOpened(false);
            setTimeout(() => handleChartPreview(songId, 0), 300);
          }}>
            <Text fz="md">1P 谱面</Text>
          </Button>
          <Button variant="default" onClick={() => {
            setBuddyMenuOpened(false);
            setTimeout(() => handleChartPreview(songId, 1), 300);
          }}>
            <Text fz="md">2P 谱面</Text>
          </Button>
        </Group>
      </Modal>
      <Card className={classes.scoreCard} c="white" mih={82.5} pt={5} p="0.5rem" shadow="sm" radius="md" withBorder style={{
        border: `2px solid ${getScoreSecondaryColor("maimai", colorIndex)}`.replace(")", ", 0.95)"),
        backgroundColor: getScoreCardBackgroundColor("maimai", colorIndex).replace(")", ", 0.95)"),
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }} onClick={onClick}>
        <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
          {isUtage ? (
            <Text fz="sm" fw={500} style={{ flex: 1 }}>
              U·TA·GE
              <Title component="span" order={3} fw={500} ml="xs">
                {difficulty.level}
              </Title>
            </Text>
          ) : (
            <Text fz="sm" fw={500} style={{ flex: 1 }}>
              {["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"][difficulty.difficulty]}
              <Title component="span" order={3} fw={500} ml="xs">
                {difficulty.level_value.toFixed(1)}
              </Title>
            </Text>
          )}
          {songId && (
            <Tooltip label="谱面预览">
              <ActionIcon
                variant="subtle"
                color="white"
                size="sm"
                mr="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  if (difficulty?.is_buddy) {
                    setBuddyMenuOpened((o) => !o);
                  } else {
                    const typeOffset = difficulty.type === 'dx' ? 1 : 0;
                    handleChartPreview(typeOffset * 10000 + songId, difficulty.difficulty);
                  }
                }}
              >
                <IconPlayerPlay size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Flex>
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
            <Badge variant="filled" color="#49090a" size="sm" ml="xs">BUDDY</Badge>
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
          <Divider color={getScoreSecondaryColor("maimai", colorIndex)} />
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
    </>
  )
}
