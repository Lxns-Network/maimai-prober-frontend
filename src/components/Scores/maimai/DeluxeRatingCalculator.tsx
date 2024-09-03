import {
  Chip,
  Group,
  Modal, NumberInput, ScrollArea, Stack, Table, Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import classes from "./DeluxeRatingCalculator.module.css";

interface RatingHistoryModalProps {
  defaultAchievements?: number;
  defaultDeluxeRating?: number;
  defaultLevelValue?: number;
  opened: boolean;
  onClose: (score?: any) => void;
}

type CoefficientDict = { [key: number]: number };

const coefficientDict: CoefficientDict = {
  10.0: 0.0,
  20.0: 1.6,
  30.0: 3.2,
  40.0: 4.8,
  50.0: 6.4,
  60.0: 8.0,
  70.0: 9.6,
  75.0: 11.2,
  79.9999: 12.0,
  80.0: 12.8,
  90.0: 13.6,
  94.0: 15.2,
  96.9999: 16.8,
  97.0: 17.6,
  98.0: 20.0,
  98.9999: 20.3,
  99.0: 20.6,
  99.5: 20.8,
  99.9999: 21.1,
  100.0: 21.4,
  100.4999: 21.6,
  100.5: 22.2,
};

function calculateRating(chartConstant: number, achievementRate: number): number {
  let levelCoefficient = 22.4;

  for (const rate of Object.keys(coefficientDict).map(Number).sort((a, b) => a - b)) {
    if (achievementRate < rate) {
      levelCoefficient = coefficientDict[rate];
      break;
    }
  }

  achievementRate = Math.min(achievementRate, 100.5);
  const achievementRateCoefficient = achievementRate / 100;

  return achievementRateCoefficient * levelCoefficient * chartConstant;
}

export const DeluxeRatingCalculator = ({ defaultAchievements, defaultLevelValue, defaultDeluxeRating, opened, onClose }: RatingHistoryModalProps) => {
  const [achievements, setAchievements] = useState(defaultAchievements);
  const [deluxeRating, setDeluxeRating] = useState(defaultDeluxeRating);
  const [levelValue, setLevelValue] = useState(defaultLevelValue);
  const [rows, setRows] = useState([] as any[]);
  const [method, setMethod] = useState("level_value");

  useEffect(() => {
    const newRows = [] as any[];
    if (method === "level_value") {
      for (const achievements of Object.keys(coefficientDict).map(Number)) {
        newRows.push({
          levelValue: levelValue || 0,
          achievements: achievements,
          deluxeRating: calculateRating(levelValue || 0, achievements),
        });
      }
      newRows.sort((a, b) => b.deluxeRating - a.deluxeRating);
    } else if (method === "achievements") {
      for (let i = 10; i <= 150; i++) {
        newRows.push({
          levelValue: i/10,
          achievements: achievements || 0,
          deluxeRating: calculateRating(i/10, achievements || 0),
        });
      }
      newRows.sort((a, b) => b.deluxeRating - a.deluxeRating);
    } else if (method === "dx_rating") {
      for (let i = 10; i <= 150; i++) {
        if (calculateRating(i/10, 101) < (deluxeRating || 0)) continue;
        let l = 0, r = 1010000, ans = r;
        while (r >= l) {
          let mid = Math.floor((r + l) / 2);
          if (calculateRating(i/10, mid/10000) >= (deluxeRating || 0)) {
            ans = mid;
            r = mid - 1;
          } else {
            l = mid + 1;
          }
        }
        if (!newRows.length || Math.round(newRows[newRows.length - 1].achievements * 10000) != ans) {
          newRows.push({
            levelValue: i/10,
            achievements: ans/10000,
            deluxeRating: calculateRating(i/10, ans/10000),
          });
        }
      }
      newRows.sort((a, b) => b.achievements - a.achievements);
    }
    setRows(newRows);
  }, [method, achievements, deluxeRating, levelValue]);

  useEffect(() => {
    setAchievements(defaultAchievements);
    setDeluxeRating(defaultDeluxeRating);
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
              <Text size="sm" fw={500} mb={4}>计算方式</Text>
              <Chip.Group value={method} onChange={(value) => setMethod(value as string)}>
                <Group>
                  <Chip value="level_value">定数</Chip>
                  <Chip value="achievements">达成率</Chip>
                  <Chip value="dx_rating">DX Rating</Chip>
                </Group>
              </Chip.Group>
            </div>
            {method === "level_value" && <NumberInput
              variant="filled"
              label="定数"
              step={0.1}
              min={0}
              max={15}
              decimalScale={1}
              value={levelValue}
              onChange={(value) => setLevelValue(value as number)}
            />}
            {method === "achievements" && <NumberInput
              variant="filled"
              label="达成率"
              min={0}
              max={101}
              decimalScale={4}
              suffix="%"
              value={achievements}
              onChange={(value) => setAchievements(value as number)}
            />}
            {method === "dx_rating" && <NumberInput
              variant="filled"
              label="DX Rating"
              min={0}
              value={deluxeRating}
              onChange={(value) => setDeluxeRating(value as number)}
            />}
            <ScrollArea h={300}>
              <Table stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>达成率</Table.Th>
                    <Table.Th>定数</Table.Th>
                    <Table.Th>DX Rating</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row, index) => {
                    if (row.achievements === 0) return null;
                    return <Table.Tr key={index}>
                      <Table.Td>{row.achievements.toFixed(4)}%</Table.Td>
                      <Table.Td>{row.levelValue.toFixed(1)}</Table.Td>
                      {method != "dx_rating" && rows[index+1] ? (
                        <Table.Td className={classes.changeLabel} fw={500} data-label={
                          `+ ${(Math.round(row.deluxeRating*100)-Math.round(rows[index+1].deluxeRating*100))/100}`
                        }>
                          {row.deluxeRating.toFixed(2)}
                        </Table.Td>
                      ) : (
                        <Table.Td fw={500}>
                          {row.deluxeRating.toFixed(2)}
                        </Table.Td>
                      )}
                    </Table.Tr>
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Text fz="xs" c="dimmed">※ 该 DX Rating 计算器仍在测试中，计算结果仅供参考。</Text>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}