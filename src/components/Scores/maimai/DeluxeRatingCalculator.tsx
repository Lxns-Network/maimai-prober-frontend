import { Chip, Group, Modal, NumberInput, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import classes from "./DeluxeRatingCalculator.module.css";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { calculateMaimaiRating, maimaiCoefficientDict } from "@/utils/rating.ts";

interface DeluxeRatingCalculatorProps {
  defaultAchievements?: number;
  defaultDeluxeRating?: number;
  defaultLevelValue?: number;
  opened: boolean;
  onClose: () => void;
}

interface RowProps {
  levelValue: number;
  achievements: number;
  deluxeRating: number;
}

export const DeluxeRatingCalculator = ({
  defaultAchievements,
  defaultLevelValue,
  defaultDeluxeRating,
  opened,
  onClose,
}: DeluxeRatingCalculatorProps) => {
  useBackDismiss(opened, onClose);

  const [achievements, setAchievements] = useState(defaultAchievements);
  const [deluxeRating, setDeluxeRating] = useState(defaultDeluxeRating);
  const [levelValue, setLevelValue] = useState(defaultLevelValue);
  const [rows, setRows] = useState<RowProps[]>([]);
  const [method, setMethod] = useState("level_value");

  useEffect(() => {
    const newRows = [];
    if (method === "level_value") {
      for (const achievements of Object.keys(maimaiCoefficientDict).map(Number)) {
        newRows.push({
          levelValue: levelValue || 0,
          achievements: achievements,
          deluxeRating: calculateMaimaiRating(levelValue || 0, achievements),
        });
      }
      newRows.sort((a, b) => b.deluxeRating - a.deluxeRating);
    } else if (method === "achievements") {
      for (let i = 10; i <= 150; i++) {
        newRows.push({
          levelValue: i / 10,
          achievements: achievements || 0,
          deluxeRating: calculateMaimaiRating(i / 10, achievements || 0),
        });
      }
      newRows.sort((a, b) => b.deluxeRating - a.deluxeRating);
    } else if (method === "dx_rating") {
      for (let i = 10; i <= 150; i++) {
        if (calculateMaimaiRating(i / 10, 101) < (deluxeRating || 0)) continue;
        let l = 0,
          r = 1010000,
          ans = r;
        while (r >= l) {
          const mid = Math.floor((r + l) / 2);
          if (calculateMaimaiRating(i / 10, mid / 10000) >= (deluxeRating || 0)) {
            ans = mid;
            r = mid - 1;
          } else {
            l = mid + 1;
          }
        }
        if (
          !newRows.length ||
          Math.round(newRows[newRows.length - 1].achievements * 10000) != ans
        ) {
          newRows.push({
            levelValue: i / 10,
            achievements: ans / 10000,
            deluxeRating: calculateMaimaiRating(i / 10, ans / 10000),
          });
        }
      }
      newRows.sort((a, b) => b.achievements - a.achievements);
    }
    setRows(newRows);
  }, [method, achievements, deluxeRating, levelValue]);

  useEffect(() => {
    setAchievements(defaultAchievements);
    setDeluxeRating(parseInt(String(defaultDeluxeRating)));
    setLevelValue(defaultLevelValue);
  }, [defaultAchievements, defaultDeluxeRating, defaultLevelValue]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>DX Rating 计算器</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Stack gap="xs">
            <div>
              <Text size="sm" fw={500} mb={4}>
                计算方式
              </Text>
              <Chip.Group value={method} onChange={(value) => setMethod(value as string)}>
                <Group>
                  <Chip value="level_value">定数</Chip>
                  <Chip value="achievements">达成率</Chip>
                  <Chip value="dx_rating">DX Rating</Chip>
                </Group>
              </Chip.Group>
            </div>
            {method === "level_value" && (
              <NumberInput
                variant="filled"
                label="定数"
                step={0.1}
                min={0}
                max={15}
                decimalScale={1}
                value={levelValue}
                onChange={(value) => {
                  if (typeof value === "number") setLevelValue(value);
                }}
              />
            )}
            {method === "achievements" && (
              <NumberInput
                variant="filled"
                label="达成率"
                min={0}
                max={101}
                decimalScale={4}
                suffix="%"
                value={achievements}
                onChange={(value) => {
                  if (typeof value === "number") setAchievements(value);
                }}
              />
            )}
            {method === "dx_rating" && (
              <NumberInput
                variant="filled"
                label="DX Rating"
                min={0}
                allowDecimal={false}
                value={deluxeRating}
                onChange={(value) => {
                  if (typeof value === "number") setDeluxeRating(value);
                }}
              />
            )}
            <ScrollArea h={300}>
              <Table stickyHeader horizontalSpacing={0} layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={10}>达成率</Table.Th>
                    <Table.Th w={5}>定数</Table.Th>
                    <Table.Th w={10}>DX Rating</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row, index) => {
                    if (row.achievements === 0) return null;
                    return (
                      <Table.Tr key={index}>
                        <Table.Td>{row.achievements.toFixed(4)}%</Table.Td>
                        <Table.Td>{row.levelValue.toFixed(1)}</Table.Td>
                        {method != "dx_rating" && rows[index + 1] ? (
                          <Table.Td
                            className={classes.changeLabel}
                            fw={500}
                            data-label={`+ ${parseInt(row.deluxeRating.toString()) - parseInt(rows[index + 1].deluxeRating.toString())}`}
                          >
                            {parseInt(row.deluxeRating.toString())}
                            <Text span c="gray" size="sm">
                              .{row.deluxeRating.toFixed(2).split(".")[1]}
                            </Text>
                          </Table.Td>
                        ) : (
                          <Table.Td fw={500}>
                            {parseInt(row.deluxeRating.toString())}
                            <Text span c="gray" size="sm">
                              .{row.deluxeRating.toFixed(2).split(".")[1]}
                            </Text>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
