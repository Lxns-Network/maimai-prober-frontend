import { ChunithmDifficultyProps, ChunithmNotesProps } from "../../../utils/api/song/chunithm.tsx";
import {Box, Flex, keys, Space, Table, Text} from "@mantine/core";
import {useContext} from "react";
import {ApiContext} from "../../../App.tsx";

const ChartNotes = ({ notes }: { notes: ChunithmNotesProps }) => {
  if (!notes) return;

  return <Table.ScrollContainer minWidth={0}>
    <Table mb={-12} horizontalSpacing={0}>
      <Table.Tbody>
        {keys(notes).map((key) => {
          return <Table.Tr key={key}>
            <Table.Td>{key.toLocaleUpperCase()}</Table.Td>
            <Table.Td>{notes[key]}</Table.Td>
          </Table.Tr>;
        })}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>;
}

export const ChunithmChart = ({ difficulty }: { difficulty: ChunithmDifficultyProps }) => {
  const context = useContext(ApiContext);
  const versions = context.songList.chunithm.versions;

  if (!difficulty) return;

  return <>
    <Flex columnGap="xl">
      {difficulty.note_designer && (
        <Box>
          <Text fz="xs" c="gray">谱师</Text>
          <Text fz="sm">{difficulty.note_designer}</Text>
        </Box>
      )}
      <Box>
        <Text fz="xs" c="gray">版本</Text>
        <Text fz="sm">
          {versions.slice().reverse().find((version) => difficulty.version >= version.version)?.title || "未知"}
        </Text>
      </Box>
    </Flex>
    <Space h="md" />
    <Text size="xs" c="gray">物量</Text>
    <ChartNotes notes={difficulty.notes} />
  </>;
}