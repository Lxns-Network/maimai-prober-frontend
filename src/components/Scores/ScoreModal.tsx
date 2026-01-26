import { useEffect, useRef, useState } from "react";
import { fetchAPI } from "@/utils/api/api.ts";
import {
  Accordion, ActionIcon, Avatar, Badge, Center, CheckIcon, Combobox, Container, Group, Modal, ScrollArea, Space, Stack,
  Text, Transition, useCombobox
} from "@mantine/core";
import { MaimaiDifficultyProps, MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmDifficultyProps, ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { MaimaiScoreModalContent } from "./maimai/ScoreModal.tsx";
import { ChunithmScoreModalContent } from "./chunithm/ScoreModal.tsx";
import { MaimaiChart } from "./maimai/Chart.tsx";
import classes from "./ScoreModal.module.css"
import { ChunithmChart } from "./chunithm/Chart.tsx";
import { ScoreModalMenu } from "./ScoreModalMenu.tsx";
import { ASSET_URL } from "@/main.tsx";
import { IconDots, IconPhotoOff } from "@tabler/icons-react";
import { useIntersection, useMediaQuery } from "@mantine/hooks";
import { Marquee } from "../Marquee.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { ScoreRanking } from "./ScoreRanking.tsx";
import { getScoreCardBackgroundColor } from "@/utils/color.ts";
import { ChartComment } from "./ChartComment.tsx";
import { rankData, ScoreHistory } from "./ScoreHistory.tsx";

interface ScoreModalProps {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  opened: boolean;
  onClose: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
}

const difficultyLabelData = {
  maimai: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER", "U·TA·GE"],
  chunithm: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "ULTIMA", "WORLD'S END"],
}

function getDifficultyLabel(game: Game, difficulty: MaimaiDifficultyProps | ChunithmDifficultyProps) {
  if ("type" in difficulty && difficulty.type === "utage") {
    return `${difficultyLabelData[game][5]} ${difficulty.level}`;
  } else if (game === "chunithm" && difficulty.kanji) {
    return `${difficultyLabelData[game][5]} ${difficulty.kanji}`;
  }
  return `${difficultyLabelData[game][difficulty.difficulty]} ${difficulty.level_value.toFixed(1)}`;
}

function getDifficultyColor(game: Game, difficulty: MaimaiDifficultyProps | ChunithmDifficultyProps) {
  if ("type" in difficulty && difficulty.type === "utage") {
    return getScoreCardBackgroundColor(game, 5);
  } else if (game === "chunithm" && difficulty.kanji) {
    return getScoreCardBackgroundColor(game, 5);
  }
  return getScoreCardBackgroundColor(game, difficulty.difficulty);
}

type SongState =
  | { game: "maimai"; song: MaimaiSongProps | null }
  | { game: "chunithm"; song: ChunithmSongProps | null };

type DifficultyState =
  | { game: "maimai"; difficulty: MaimaiDifficultyProps | null }
  | { game: "chunithm"; difficulty: ChunithmDifficultyProps | null };

export const ScoreModal = ({ game, score, opened, onClose }: ScoreModalProps) => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [songState, setSongState] = useState<SongState | null>(null);
  const [difficultyState, setDifficultyState] = useState<DifficultyState | null>(null);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const getSongList = useSongListStore((state) => state.getSongList);
  const small = useMediaQuery('(max-width: 30rem)');

  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, entry } = useIntersection({
    root: containerRef.current,
    threshold: 0.95,
  });

  // ScoreHistory
  const [minRank, setMinRank] = useState<string>("A");

  // ChartComment
  const [commentCount, setCommentCount] = useState<number>(0);

  const getSongDetailHandler = async (id: number) => {
    const res = await fetchAPI(`${game}/song/${id}`, {
      method: "GET",
    });
    const data = await res.json();
    setSongState((prev => {
      if (!prev) return prev;
      return { ...prev, song: data };
    }));
  }

  useEffect(() => {
    setSongState(null);
    setSongList(getSongList(game));
  }, [game]);

  useEffect(() => {
    if (!songState?.song || !songList || !score) return;

    if (songState.game === "maimai" && songList instanceof MaimaiSongList) {
      const s = score as MaimaiScoreProps;
      const difficulty = songList.getDifficulty(songState.song, s.type, s.level_index);
      setDifficultyState({ game: "maimai", difficulty });
    }

    if (songState.game === "chunithm" && songList instanceof ChunithmSongList) {
      const s = score as ChunithmScoreProps;
      const difficulty = songList.getDifficulty(songState.song, s.level_index);
      setDifficultyState({ game: "chunithm", difficulty });
    }
  }, [songState, score, songList]);

  useEffect(() => {
    if (!score || !songList) {
      setSongState(null);
      return;
    }

    const song = songList.find(score.id);
    if (!song) {
      setSongState(null);
      return;
    }

    getSongDetailHandler(score.id);

    if (game === "maimai") {
      setSongState({ game: "maimai", song: song as MaimaiSongProps });
    } else if (game === "chunithm") {
      setSongState({ game: "chunithm", song: song as ChunithmSongProps });
    }
  }, [score, songList, game]);

  function isMaimaiScoreProps(obj: unknown): obj is MaimaiScoreProps {
    if (!obj) return false;
    return typeof obj === 'object' && 'achievements' in obj;
  }

  function isChunithmScoreProps(obj: unknown): obj is ChunithmScoreProps {
    if (!obj) return false;
    return typeof obj === 'object' && 'score' in obj;
  }

  return (
    <Modal.Root
      size="lg"
      opened={opened}
      onClose={onClose}
      fullScreen={small}
      transitionProps={{
        transition: small ? 'pop' : 'fade-down',
      }}
      scrollAreaComponent={ScrollArea.Autosize}
      centered
    >
      <Modal.Overlay />
      <Modal.Content ref={containerRef}>
        <Modal.Header mah={60}>
          <Modal.Title>
            <Transition
              mounted={entry?.isIntersecting ?? true}
              transition="slide-right"
              enterDelay={300}
              duration={250}
            >
              {(styles) => (
                <Text style={styles}>成绩详情</Text>
              )}
            </Transition>
            <Transition
              mounted={entry ? !entry.isIntersecting : false}
              transition="slide-right"
              enterDelay={300}
              duration={250}
              keepMounted
            >
              {(styles) => (
                <Group wrap="nowrap" gap="xs" style={styles}>
                  <Avatar src={songState ? `${ASSET_URL}/${game}/jacket/${songList?.getSongResourceId(songState.song!.id)}.png!webp` : null} size={28} radius="md">
                    <IconPhotoOff />
                  </Avatar>
                  <Stack gap={0}>
                    <Marquee>
                      <Text>{songState?.song?.title}</Text>
                    </Marquee>
                    {difficultyState && difficultyState.difficulty && (
                      <Text size="sm" fw="700" c={getDifficultyColor(game, difficultyState.difficulty)}>
                        {getDifficultyLabel(game, difficultyState.difficulty)}
                      </Text>
                    )}
                  </Stack>
                </Group>
              )}
            </Transition>
          </Modal.Title>
          <Space w="xs" />
          <Group wrap="nowrap" gap="xs">
            {score && <ScoreModalMenu score={score} difficulty={difficultyState?.difficulty ?? undefined} onClose={onClose} />}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          {songState && songState.song && (
            <Container ref={ref}>
              {songState.game === "maimai" && isMaimaiScoreProps(score) && <MaimaiScoreModalContent score={score} song={songState.song} />}
              {songState.game === "chunithm" && isChunithmScoreProps(score) && <ChunithmScoreModalContent score={score} song={songState.song} />}
            </Container>
          )}
          <Space h="md" />
          <Accordion className={classes.accordion} chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            <Accordion.Item value="history">
              <Center>
                <Accordion.Control>游玩历史记录</Accordion.Control>
                <Combobox
                  shadow="md"
                  position="bottom-end"
                  width={200}
                  store={combobox}
                  onOptionSubmit={(val) => {
                    setMinRank(val);
                    combobox.closeDropdown();
                  }}
                  transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
                >
                  <Combobox.Target>
                    <ActionIcon className={classes.actionIcon} variant="subtle" mr="xs" onClick={() => combobox.toggleDropdown()}>
                      <IconDots size={18} stroke={1.5} />
                    </ActionIcon>
                  </Combobox.Target>
                  <Combobox.Dropdown>
                    <Combobox.Group label="最低评级">
                      <Combobox.Options>
                        {rankData[game] && Object.keys(rankData[game]).map((rank) => (
                          <Combobox.Option value={rank} key={`${game}:${rank}`} active={minRank === rank}>
                            <Group gap="sm">
                              {minRank === rank && <CheckIcon color="gray" size={12}/>}
                              <span>{rank}</span>
                            </Group>
                          </Combobox.Option>
                        ))}
                      </Combobox.Options>
                    </Combobox.Group>
                  </Combobox.Dropdown>
                </Combobox>
              </Center>
              <Accordion.Panel>
                <ScoreHistory game={game} score={score} minRank={minRank} />
              </Accordion.Panel>
            </Accordion.Item>
            {difficultyState && difficultyState.difficulty && (
              <Accordion.Item value="chart">
                <Accordion.Control>谱面详情</Accordion.Control>
                <Accordion.Panel>
                  {difficultyState.game === "maimai" && isMaimaiScoreProps(score) && <MaimaiChart difficulty={difficultyState.difficulty} />}
                  {difficultyState.game === "chunithm" && isChunithmScoreProps(score) && <ChunithmChart difficulty={difficultyState.difficulty} />}
                </Accordion.Panel>
              </Accordion.Item>
            )}
            <Accordion.Item value="comment">
              <Accordion.Control>
                <Group>
                  <span>评分与评论</span>
                  <Badge color="gray" variant="light">{commentCount}</Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <ChartComment game={game} score={score} setCommentCount={setCommentCount} />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="ranking">
              <Accordion.Control>排行榜</Accordion.Control>
              <Accordion.Panel>
                <ScoreRanking game={game} score={score} />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}