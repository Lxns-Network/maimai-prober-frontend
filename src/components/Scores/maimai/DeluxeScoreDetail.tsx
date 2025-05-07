import { Group, Modal, NumberFormatter, Stack, Table, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { MaimaiNotesProps } from "@/utils/api/song/maimai.ts";
import { DeluxeScoreStars, getDeluxeScoreStars, getTotalNotes } from "@/components/Scores/maimai/ScoreModal.tsx";
import classes from "./DeluxeRatingCalculator.module.css";

interface DeluxeScoreDetailProps {
  deluxeScore: number;
  notes?: MaimaiNotesProps;
  opened: boolean;
  onClose: () => void;
}

interface RowProps {
  count: number;
  rate: 1 | 2 | 3;
  percentage: number;
  deluxeScore: number;
}

export const DeluxeScoreDetail = ({ deluxeScore, notes, opened, onClose }: DeluxeScoreDetailProps) => {
  const [rows, setRows] = useState<RowProps[]>([]);

  useEffect(() => {
    if (!notes) return;

    const totalNotes = getTotalNotes(notes);

    const newRows: RowProps[] = [85, 90, 93, 95, 97].map((percentage) => {
      const deluxeScore = Math.floor((percentage / 100) * totalNotes * 3) + 1;
      const { count, rate } = getDeluxeScoreStars(deluxeScore, notes);
      return { count, rate, percentage, deluxeScore };
    });

    setRows(newRows);
  }, [notes]);

  if (!notes) return null;

  function getNextDeluxeScore(deluxeScore: number) {
    const nextRow = rows.find((row) => deluxeScore < row.deluxeScore);
    return nextRow ? nextRow.deluxeScore : null;
  }

  const nextDeluxeScore = getNextDeluxeScore(deluxeScore);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>DX 分数详情</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Stack gap="xs">
            {nextDeluxeScore ? (
              <Group gap={8} align="center">
                <Text size="sm">距离下一个星级</Text>
                <Group wrap="nowrap" h={16} gap={0}>
                  <DeluxeScoreStars
                    deluxeScore={nextDeluxeScore}
                    notes={notes}
                  />
                </Group>
                <Text size="sm">
                  还差 <NumberFormatter value={nextDeluxeScore - deluxeScore} thousandSeparator /> 分
                </Text>
              </Group>
            ) : (
              <Text size="sm">
                已达到最高星级
              </Text>
            )}
            <Table horizontalSpacing={0}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>星级</Table.Th>
                  <Table.Th>达成率</Table.Th>
                  <Table.Th>目标分数</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row, index) => {
                  return <Table.Tr key={index}>
                    <Table.Td>
                      <Group wrap="nowrap" h={16} gap={0}>
                        <DeluxeScoreStars deluxeScore={row.deluxeScore} notes={notes} />
                      </Group>
                    </Table.Td>
                    <Table.Td>{row.percentage}%</Table.Td>
                    {rows[index+1] ? (
                      <Table.Td className={classes.changeLabel} data-label={
                        `+ ${rows[index+1].deluxeScore - row.deluxeScore}`
                      }>
                        <NumberFormatter value={row.deluxeScore} thousandSeparator />
                      </Table.Td>
                    ) : (
                      <Table.Td>
                        <NumberFormatter value={row.deluxeScore} thousandSeparator />
                      </Table.Td>
                    )}
                  </Table.Tr>
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}