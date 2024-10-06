import { MaimaiDifficultyProps, MaimaiNotesProps } from "@/utils/api/song/maimai.ts";
import { Box, Center, Group, keys, Loader, SegmentedControl, Select, Space, Table, Text } from "@mantine/core";
import { useState } from "react";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";

type NotesType = "tap" | "hold" | "slide" | "touch" | "break";

// 基础权重
const basic = {
  perfect: {
    tap: 1,
    hold: 2,
    slide: 3,
    touch: 1,
    break: 5,
  },
  great: {
    tap: 0.8,
    hold: 1.6,
    slide: 2.4,
    touch: 0.8,
    break: [4, 3, 2.5],
  },
  good: {
    tap: 0.5,
    hold: 1,
    slide: 1.5,
    touch: 0.5,
    break: 2,
  },
  miss: {
    tap: 0,
    hold: 0,
    slide: 0,
    touch: 0,
    break: 0,
  }
}

// 绝赞权重
const break_bonus = {
  critical_perfect: 1,
  perfect: [0.75, 0.5],
  great: 0.4,
  good: 0.3,
  miss: 0,
};

const ChartNotes = ({ notes }: { notes: MaimaiNotesProps }) => {
  const [mode, setMode] = useState("101-");

  if (!notes) return (
    <Center mt="xs" mb="md">
      <Loader />
    </Center>
  );

  const total = notes.tap + notes.touch + 2 * notes.hold + 3 * notes.slide + 5 * notes.break;

  const rows = keys(notes).map((key) => {
    key = key as NotesType | "total";

    if (key === "touch" && notes[key] === 0) {
      return <Table.Tr key={`${mode}:${key}`}>
        <Table.Td>TOUCH</Table.Td>
        {Array(5).fill(0).map((_, i) => {
          return <Table.Td key={i}>-</Table.Td>;
        })}
      </Table.Tr>;
    }

    return <Table.Tr key={`${mode}:${key}`}>
      <Table.Td>{key.toLocaleUpperCase()}</Table.Td>
      <Table.Td>{notes[key]}</Table.Td>
      {keys(basic).map((type) => {
        if (key === "break" && type === "perfect") {
          const critical_perfect_bonus = break_bonus.critical_perfect / notes.break;
          if (mode == "100-") {
            return <Table.Td key={type}>
              <Text size="sm" c="yellow">{critical_perfect_bonus.toFixed(4)}%</Text>
              <div>{(break_bonus.perfect[0] / notes.break).toFixed(4)}%</div>
              <div>{(critical_perfect_bonus - break_bonus.perfect[1] / notes.break).toFixed(4)}%</div>
            </Table.Td>;
          }
          if (mode == "101-") {
            return <Table.Td key={type}>
              <Text size="sm" c="yellow">{(0).toFixed(4)}%</Text>
              {break_bonus.perfect.map((v) => {
                return <div key={v}>{(v / notes.break - critical_perfect_bonus).toFixed(4)}%</div>;
              })}
            </Table.Td>;
          }
          const percentage = basic.perfect.break / total * 100;
          return <Table.Td key={type}>
            <Text size="sm" c="yellow">{(percentage + critical_perfect_bonus).toFixed(4)}%</Text>
            {break_bonus.perfect.map((v) => {
              return <div key={v}>{(percentage + v / notes.break).toFixed(4)}%</div>;
            })}
          </Table.Td>;
        } else if (key === "break" && type === "great") {
          return <Table.Td key={type}>
            {(basic[type][key] as number[]).map((v) => {
              let percentage = v / total * 100;
              percentage += break_bonus.great / notes.break
              if (mode == "100-" || mode == "101-") {
                let perfect_break = basic.perfect.break / total * 100;
                if (mode == "101-") perfect_break += break_bonus.critical_perfect / notes.break;
                return <div key={v}>{(percentage - perfect_break).toFixed(4)}%</div>;
              }
              return <div key={v}>{percentage.toFixed(4)}%</div>;
            })}
          </Table.Td>;
        } else if (key !== "total") {
          let a = basic[type][key] as number;
          let b = break_bonus[type];
          if (mode == "100-" || mode == "101-") {
            if (type === "perfect") {
              a = basic.miss[key]
            } else if (type === "great") {
              a = basic.perfect[key] - +basic.great[key];
            } else if (type === "good") {
              a = basic.perfect[key] - basic.good[key];
              if (mode == "101-") b = break_bonus.critical_perfect - break_bonus.good;
              else b = break_bonus.miss - break_bonus.good;
            } else if (type === "miss") {
              a = basic.perfect[key];
              if (mode == "101-") b = break_bonus.critical_perfect;
            }
          }
          let percentage = a / total * 100;
          if (key === "break" && typeof b === "number") {
            percentage += b / notes.break;
          }
          if (mode === "100-" || mode === "101-") {
            percentage = -percentage
          }
          return <Table.Td key={type}>{percentage.toFixed(4)}%</Table.Td>;
        } else {
          return <Table.Td key={type}>-</Table.Td>;
        }
      })}
    </Table.Tr>;
  });

  return <Table.ScrollContainer minWidth={440}>
    <Table mb={-12} horizontalSpacing={0}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>
            <Select
              variant="unstyled"
              size="xs"
              w={56}
              data={['0+', '100-', '101-']}
              defaultValue="101-"
              value={mode}
              onChange={(value) => setMode(value as string)}
              withCheckIcon={false}
              comboboxProps={{
                shadow: 'md',
                transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' }
              }}
            />
          </Table.Th>
          <Table.Th>物量</Table.Th>
          <Table.Th c="orange">PERFECT</Table.Th>
          <Table.Th c="pink">GREAT</Table.Th>
          <Table.Th c="green">GOOD</Table.Th>
          <Table.Th c="gray">MISS</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  </Table.ScrollContainer>;
}

export const MaimaiChart = ({ difficulty }: { difficulty: MaimaiDifficultyProps }) => {
  const { versions } = useSongListStore(
    useShallow((state) => ({ versions: state.maimai.versions })),
  )
  const [side, setSide] = useState<"left" | "right">("left");

  if (!difficulty) return;

  return <>
    <Group>
      {difficulty.note_designer && (
        <Box mr={12}>
          <Text fz="xs" c="gray">谱师</Text>
          <Text fz="sm">{difficulty.note_designer}</Text>
        </Box>
      )}
      <Box mr={12}>
        <Text fz="xs" c="gray">版本</Text>
        <Text fz="sm">
          {versions.slice().reverse().find((version) => difficulty.version >= version.version)?.title || "未知"}
        </Text>
      </Box>
    </Group>
    <Space h="xs" />
    {difficulty.is_buddy ? (
      <>
        <Center>
          <SegmentedControl
            size="xs"
            data={[{
              value: "left",
              label: "1P 谱面"
            }, {
              value: "right",
              label: "2P 谱面"
            }]}
            value={side}
            onChange={(value) => setSide(value as "left" | "right")}
          />
        </Center>
        <Space h={4} />
        <ChartNotes notes={difficulty.notes[side] as MaimaiNotesProps} />
      </>
    ) : (
      <ChartNotes notes={difficulty.notes} />
    )}
    <Space h={4} />
    <Text fz="xs" c="dimmed">※ 该表格代表每个 Note 不同评价在达成率中所占的比例，结果仅供参考。</Text>
  </>;
}