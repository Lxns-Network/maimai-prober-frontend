import {
  Badge, Flex, Group, HoverCard, Image, Mark, Modal, NumberFormatter, rem, Space, Text, ThemeIcon
} from "@mantine/core";
import { ScoreChangeDetailProps, ScoreChangesProps } from "@/pages/user/Sync.tsx";
import { DataTable } from "mantine-datatable";
import { IconArrowRight, IconDatabaseOff, IconHelp } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getScoreCardBackgroundColor } from "@/utils/color.ts";
import { Marquee } from "../Marquee.tsx";
import { Game } from "@/types/game";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";

interface ScoresChangesModalProps {
  game: Game;
  scores: ScoreChangesProps[];
  opened: boolean;
  onClose: () => void;
}

const MusicIconChangeCell = ({ game, icon }: { game: Game, icon: ScoreChangeDetailProps }) => {
  if (icon.new !== undefined && icon.new !== null) {
    if (game === "chunithm") {
      return <Group gap={0} h={0} ml={-3} wrap="nowrap">
        <Image
          src={`/assets/${game}/music_icon/${icon.old || "blank"}_xs.webp`}
          h={rem(24)}
          w={rem(24)}
        />
        <ThemeIcon variant="subtle" color="gray" size={20}>
          <IconArrowRight />
        </ThemeIcon>
        <Image
          src={`/assets/${game}/music_icon/${icon.new || "blank"}_xs.webp`}
          h={rem(24)}
          w={rem(24)}
        />
      </Group>;
    }
    return <Group gap={0} h={0} ml={-3} wrap="nowrap">
      <Image
        src={`/assets/${game}/music_icon/${icon.old || "blank"}.webp`}
        h={rem(24)}
        w={rem(24)}
      />
      <ThemeIcon variant="subtle" color="gray" size={20}>
        <IconArrowRight />
      </ThemeIcon>
      <Image
        src={`/assets/${game}/music_icon/${icon.new || "blank"}.webp`}
        h={rem(24)}
        w={rem(24)}
      />
    </Group>;
  }
  if (game === "chunithm") {
    return <Image
      src={`/assets/${game}/music_icon/${icon.old || "blank"}_xs.webp`}
      h={rem(24)} w="auto" ml={-3}
    />;
  }
  return <Image
    src={`/assets/${game}/music_icon/${icon.old || "blank"}.webp`}
    h={rem(24)} w="auto" ml={-3}
  />;
}

function containsOld(obj: any): boolean {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (containsOld(obj[key])) {
        return true;
      }
    } else if (key === 'old') {
      return true;
    }
  }
  return false;
}

const ScoresChangesTable = ({ game, scores }: { game: Game, scores: ScoreChangesProps[] }) => {
  const PAGE_SIZES = [10, 15, 20];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [displayScores, setDisplayScores] = useState<ScoreChangesProps[]>([]);

  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state.chunithm })),
  )

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayScores(scores.slice(start, end));
  }, [page]);

  useEffect(() => {
    setPage(1);
    setDisplayScores(scores.slice(0, pageSize));
  }, [pageSize]);

  return (
    <DataTable
      highlightOnHover pinFirstColumn
      horizontalSpacing="md"
      mih={scores.length === 0 ? 150 : 0}
      miw={700}
      emptyState={
        <Flex gap="xs" align="center" direction="column" c="dimmed">
          <IconDatabaseOff size={48} stroke={1.5} />
          <Text fz="sm">没有记录</Text>
        </Flex>
      }
      rowBackgroundColor={(score, i) => {
        if (!containsOld(score)) {
          return { dark: 'rgb(37,64,46)', light: 'rgb(233,252,239)' }
        } else if (i % 2 === 0) {
          return { dark: 'rgb(46,46,46)', light: 'rgb(248,249,250)' }
        } else {
          return { dark: 'rgb(36,36,36)', light: 'white' }
        }
      }}
      // 数据
      idAccessor={({ id, type, level_index }) => `${id}:${type}:${level_index}`}
      columns={game === "maimai" ? [
        {
          accessor: 'id',
          title: 'ID',
          width: 20,
        },
        {
          accessor: 'song_name',
          title: '曲名',
          width: 100,
          render: ({ song_name, type }) => {
            return (
              <Flex align="center">
                {type === "standard" ? (
                  <Badge variant="filled" color="blue" size="xs" w={33} style={{
                    flexShrink: 0,
                  }}>标准</Badge>
                ) : (
                  <Badge variant="filled" color="orange" size="xs" w={33} style={{
                    flexShrink: 0,
                  }}>DX</Badge>
                )}
                <Space w={8} />
                <Marquee>{song_name}</Marquee>
              </Flex>
            );
          },
        },
        {
          accessor: 'level',
          title: '难度',
          width: 20,
          render: ({ level, level_index }) => {
            return <Text size="sm" fw="700" c={getScoreCardBackgroundColor(game, level_index)}>{level}</Text>;
          },
        },
        {
          accessor: 'achievements.new',
          title: '达成率',
          width: 50,
          render: ({ achievements }) => {
            const { new: newValue, old: oldValue } = achievements as { old?: number, new?: number };
            if (newValue !== undefined) {
              const changeValue = (Math.round(newValue * 10000) - Math.round((oldValue || 0) * 10000)) / 10000
              return (
                <Text size="sm">
                  {newValue.toFixed(4)}%
                  {oldValue !== undefined && (
                    <Text span c="green">
                      {` (+${changeValue.toFixed(4)}%)`}
                    </Text>
                  )}
                </Text>
              );
            }
            return <Text size="sm">{(oldValue || 0).toFixed(4)}%</Text>;
          },
        },
        {
          accessor: 'dx_rating.new',
          title: 'DX Rating',
          width: 50,
          render: ({ dx_rating }) => {
            const { new: newValue, old: oldValue } = dx_rating as { old?: number, new?: number };
            if (newValue !== undefined) {
              const changeValue = (Math.round(newValue * 10000) - Math.round((oldValue || 0) * 10000)) / 10000
              return (
                <Text size="sm">
                  {newValue.toFixed(2)}
                  {oldValue !== undefined && (
                    <Text span c="green">
                      {` (+${changeValue.toFixed(2)})`}
                    </Text>
                  )}
                </Text>
              );
            }
            return <Text size="sm">{(oldValue || 0).toFixed(2)}</Text>;
          },
        },
        {
          accessor: 'fc.new',
          title: '',
          width: 50,
          render: ({ fc }) => <MusicIconChangeCell game={game} icon={fc} />,
        },
        {
          accessor: 'fs.new',
          title: '',
          width: 50,
          render: ({ fs }) => <MusicIconChangeCell game={game} icon={fs} />,
        }
      ] : [
        {
          accessor: 'id',
          title: 'ID',
          width: 20,
        },
        {
          accessor: 'song_name',
          title: '曲名',
          width: 100,
          render: ({ song_name }) => <Marquee>{song_name}</Marquee>,
        },
        {
          accessor: 'level',
          title: '难度',
          width: 20,
          render: ({ id, level, level_index }) => {
            let levelLabel = level;
            if (id >= 8000) {
              const song = songList.find(id);
              if (!song) {
                levelLabel = "未知";
              } else {
                levelLabel = song.difficulties[0].kanji;
              }
            }
            return <Text size="sm" fw="700" c={getScoreCardBackgroundColor(game, level_index)}>{levelLabel}</Text>;
          },
        },
        {
          accessor: 'score.new',
          title: '分数',
          width: 50,
          render: ({ score }) => {
            const { new: newValue, old: oldValue } = score as { old?: number, new?: number };
            if (newValue !== undefined) {
              return (
                <Text size="sm">
                  <NumberFormatter value={newValue} thousandSeparator />
                  {oldValue !== undefined && (
                    <Text span c="green">
                      {` `}(+<NumberFormatter value={newValue - oldValue} thousandSeparator />)
                    </Text>
                  )}
                </Text>
              );
            }
            return <NumberFormatter value={oldValue || 0} thousandSeparator />
          },
        },
        {
          accessor: 'rating.new',
          title: 'Rating',
          width: 50,
          render: ({ rating }) => {
            const { new: newValue, old: oldValue } = rating as { old?: number, new?: number };
            if (newValue !== undefined) {
              const changeValue = (Math.round(newValue * 10000) - Math.round((oldValue || 0) * 10000)) / 10000
              return (
                <Text size="sm">
                  {newValue.toFixed(4)}
                  {oldValue !== undefined && (
                    <Text span c="green">
                      {` (+${changeValue.toFixed(4)})`}
                    </Text>
                  )}
                </Text>
              );
            }
            return <Text size="sm">{(oldValue || 0).toFixed(4)}</Text>;
          },
        },
        {
          accessor: 'full_combo.new',
          title: '',
          width: 50,
          render: ({ full_combo }) => <MusicIconChangeCell game={game} icon={full_combo} />,
        },
        {
          accessor: 'full_chain.new',
          title: '',
          width: 50,
          render: ({ full_chain }) => <MusicIconChangeCell game={game} icon={full_chain} />,
        }
      ]}
      records={displayScores}
      totalRecords={scores.length}
      noRecordsText="没有记录"
      // 分页
      recordsPerPage={pageSize}
      paginationText={({ from, to, totalRecords}) => {
        return `${from}-${to} 条成绩，共 ${totalRecords} 条`;
      }}
      page={page}
      onPageChange={(p) => setPage(p)}
      recordsPerPageOptions={PAGE_SIZES}
      recordsPerPageLabel="每页显示"
      onRecordsPerPageChange={setPageSize}
    />
  );
}

export const ScoresChangesModal = ({ game, scores, opened, onClose }: ScoresChangesModalProps) => {
  return (
    <Modal.Root opened={opened} onClose={onClose} centered size="xl">
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            <Group gap="xs">
              同步结果
              <HoverCard width={280} shadow="md">
                <HoverCard.Target>
                  <ThemeIcon variant="subtle" color="gray" size="sm">
                    <IconHelp />
                  </ThemeIcon>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                  <Text size="sm" mb="xs">
                    这里仅会显示同步后<Mark>最佳成绩</Mark>的变化情况，不会显示未破记录的成绩。
                  </Text>
                  <Text size="sm">
                    绿色底代表新成绩，其它成绩代表旧成绩更新。
                  </Text>
                </HoverCard.Dropdown>
              </HoverCard>
            </Group>
          </Modal.Title>
          <Group gap="xs">
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          <ScoresChangesTable game={game} scores={scores} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}