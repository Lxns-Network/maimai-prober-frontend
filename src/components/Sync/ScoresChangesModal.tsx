import {
  Badge, Flex, Group, HoverCard, Image, Mark, Modal, NumberFormatter, rem, Space, Text, ThemeIcon
} from "@mantine/core";
import { ScoreChangesProps } from "@/pages/user/Sync.tsx";
import { DataTable } from "mantine-datatable";
import {
  IconArrowRight, IconDatabaseOff, IconHelp,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getScoreCardBackgroundColor } from "@/utils/color.ts";
import { Marquee } from "../Marquee.tsx";

interface ScoresChangesModalProps {
  game: "maimai" | "chunithm";
  scores: ScoreChangesProps[];
  opened: boolean;
  onClose: () => void;
}

const MusicIconChangeCell = ({ game, icon }: { game: "maimai" | "chunithm", icon: { old?: string, new?: string } }) => {
  if (icon.new !== undefined && icon.new !== null) {
    if (game === "chunithm") {
      return <Group gap={0} h={0} ml={-3} wrap="nowrap">
        <Image
          src={`/assets/${game}/music_icon/${icon.old || "blank"}_xs.webp`}
          h={rem(24)}
        />
        <ThemeIcon variant="subtle" color="gray" size={20}>
          <IconArrowRight />
        </ThemeIcon>
        <Image
          src={`/assets/${game}/music_icon/${icon.new || "blank"}_xs.webp`}
          h={rem(24)}
        />
      </Group>;
    }
    return <Group gap={0} h={0} ml={-3} wrap="nowrap">
      <Image
        src={`/assets/${game}/music_icon/${icon.old || "blank"}.webp`}
        h={rem(24)}
      />
      <ThemeIcon variant="subtle" color="gray" size={20}>
        <IconArrowRight />
      </ThemeIcon>
      <Image
        src={`/assets/${game}/music_icon/${icon.new || "blank"}.webp`}
        h={rem(24)}
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
  for (let key in obj) {
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

const ScoresChangesTable = ({ game, scores }: { game: "maimai" | "chunithm", scores: ScoreChangesProps[] }) => {
  const PAGE_SIZES = [10, 15, 20];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [displayScores, setDisplayScores] = useState<any[]>([]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayScores(scores.slice(start, end));
  }, [page]);

  useEffect(() => {
    setPage(1);
    setDisplayScores(scores.slice(0, pageSize));
  }, [pageSize]);

  return <DataTable
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
          return <Flex align="center">
            {type === "standard" ? (
              <Badge variant="filled" color="blue" size="xs" w={40}>标准</Badge>
            ) : (
              <Badge variant="filled" color="orange" size="xs" w={40}>DX</Badge>
            )}
            <Space w={8} />
            <Marquee>{song_name}</Marquee>
          </Flex>;
        },
      },
      {
        accessor: 'level',
        title: '难度',
        width: 20,
        render: ({ level, level_index }) => {
          return <Text size="sm" fw="700" c={
            getScoreCardBackgroundColor(game, level_index)
          }>{level}</Text>;
        },
      },
      {
        accessor: 'achievements.new',
        title: '达成率',
        width: 50,
        render: ({ achievements }) => {
          if (achievements.new !== undefined) {
            return <Text size="sm">
              {achievements.new}%
              {achievements.old !== undefined && <Text span c="green">
                {` (+${(Math.round(achievements.new*10000)-Math.round(achievements.old*10000))/10000}%)`}
              </Text>}
            </Text>;
          }
          return <Text size="sm">{achievements.old}%</Text>;
        },
      },
      {
        accessor: 'dx_rating.new',
        title: 'DX Rating',
        width: 50,
        render: ({ dx_rating }) => {
          if (dx_rating.new !== undefined) {
            return <Text size="sm">
              {dx_rating.new.toFixed(2)}
              {dx_rating.old !== undefined && <Text span c="green">
                {` (+${((Math.round(dx_rating.new*10000)-Math.round(dx_rating.old*10000))/10000).toFixed(2)})`}
              </Text>}
            </Text>;
          }
          return <Text size="sm">{dx_rating.old.toFixed(2)}</Text>;
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
        render: ({ song_name }) => {
          return <Marquee>{song_name}</Marquee>;
        },
      },
      {
        accessor: 'level',
        title: '难度',
        width: 20,
        render: ({ level, level_index }) => {
          return <Text size="sm" fw="700" c={
            getScoreCardBackgroundColor(game, level_index)
          }>{level}</Text>;
        },
      },
      {
        accessor: 'score.new',
        title: '分数',
        width: 50,
        render: ({ score }) => {
          if (score.new !== undefined) {
            return <Text size="sm">
              <NumberFormatter value={score.new} thousandSeparator />
              {score.old !== undefined && <Text span c="green">
                {` `}(+<NumberFormatter value={score.new-score.old} thousandSeparator />)
              </Text>}
            </Text>;
          }
          return <NumberFormatter value={score.old} thousandSeparator />
        },
      },
      {
        accessor: 'rating.new',
        title: 'Rating',
        width: 50,
        render: ({ rating }) => {
          if (rating.new !== undefined) {
            return <Text size="sm">
              {rating.new.toFixed(4)}
              {rating.old !== undefined && <Text span c="green">
                {` (+${((Math.round(rating.new*10000)-Math.round(rating.old*10000))/10000).toFixed(4)})`}
              </Text>}
            </Text>;
          }
          return <Text size="sm">{rating.old.toFixed(4)}</Text>;
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