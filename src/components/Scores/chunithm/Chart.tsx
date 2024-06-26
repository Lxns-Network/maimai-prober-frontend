import { DifficultyProps, ChunithmNotesProps } from "../../../utils/api/song/chunithm.tsx";
import { keys, Space, Table, Text } from "@mantine/core";

const ChartNotes = ({ notes }: { notes: ChunithmNotesProps }) => {
  if (!notes) return;

  return <Table.ScrollContainer minWidth={0}>
    <Table mb={-12} horizontalSpacing={0}>
      <Table.Tbody>
        {keys(notes).map((key) => {
          return <Table.Tr>
            <Table.Td key={key}>{key.toLocaleUpperCase()}</Table.Td>
            <Table.Td key={key}>{notes[key]}</Table.Td>
          </Table.Tr>;
        })}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>;
}

export const ChunithmChart = ({ difficulty }: { difficulty: DifficultyProps }) => {
  if (!difficulty) return;

  return <>
    <Text size="xs" c="gray">谱师</Text>
    <Text size="sm">{difficulty.note_designer}</Text>
    <Space h="md" />
    <Text size="xs" c="gray">物量</Text>
    <ChartNotes notes={difficulty.notes} />
  </>;
}