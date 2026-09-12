import { Chip, Group, Modal, NumberInput, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { rankData } from "@/data/scoreRanks.ts";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import {
  calculateChunithmRating,
  CHUNITHM_MAX_CONSTANT,
  CHUNITHM_MAX_SCORE,
  formatChunithmValue,
  requiredChunithmScore,
  truncateChunithmValue,
} from "@/utils/chunithm/rating.ts";
import classes from "../maimai/DeluxeRatingCalculator.module.css";

interface RatingCalculatorProps {
  defaultScore: number;
  defaultLevelValue?: number;
  opened: boolean;
  onClose: () => void;
}

const constants = Array.from(
  { length: CHUNITHM_MAX_CONSTANT * 10 - 9 },
  (_, index) => (index + 10) / 10,
);

export function RatingCalculator({
  defaultScore,
  defaultLevelValue,
  opened,
  onClose,
}: RatingCalculatorProps) {
  useBackDismiss(opened, onClose);
  const initialScore = defaultScore >= 0 ? defaultScore : 1007500;
  const initialTarget =
    defaultLevelValue === undefined
      ? ""
      : truncateChunithmValue(calculateChunithmRating(defaultLevelValue, initialScore));
  const [levelValue, setLevelValue] = useState<number | string>(defaultLevelValue ?? "");
  const [score, setScore] = useState<number | string>(initialScore);
  const [target, setTarget] = useState<number | string>(initialTarget);
  const [method, setMethod] = useState("constant");

  useEffect(() => {
    if (!opened) return;
    setLevelValue(defaultLevelValue ?? "");
    setScore(initialScore);
    setTarget(initialTarget);
    setMethod("constant");
  }, [opened, defaultLevelValue, initialScore, initialTarget]);

  const validConstant =
    typeof levelValue === "number" && levelValue >= 1 && levelValue <= CHUNITHM_MAX_CONSTANT;
  const validScore =
    typeof score === "number" &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= CHUNITHM_MAX_SCORE;
  const validTarget = typeof target === "number" && Number.isFinite(target) && target >= 0;
  const rows: { constant: number; score: number; rating: number; label?: string }[] =
    method === "constant" && validConstant
      ? Object.entries(rankData.chunithm).map(([label, score]) => ({
          constant: levelValue,
          score,
          rating: calculateChunithmRating(levelValue, score),
          label,
        }))
      : method === "score" && validScore
        ? [...constants].reverse().map((constant) => ({
            constant,
            score,
            rating: calculateChunithmRating(constant, score),
          }))
        : method === "target" && validTarget
          ? constants.flatMap((constant) => {
              const score = requiredChunithmScore(constant, target);
              return score === null
                ? []
                : [{ constant, score, rating: calculateChunithmRating(constant, score) }];
            })
          : [];

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      centered
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>Rating 计算器</Modal.Title>
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
                  <Chip value="constant">定数</Chip>
                  <Chip value="score">分数</Chip>
                  <Chip value="target">Rating</Chip>
                </Group>
              </Chip.Group>
            </div>
            {method === "constant" && (
              <NumberInput
                label="定数"
                variant="filled"
                min={1}
                max={CHUNITHM_MAX_CONSTANT}
                step={0.1}
                decimalScale={1}
                value={levelValue}
                onChange={setLevelValue}
              />
            )}
            {method === "score" && (
              <NumberInput
                label="分数"
                variant="filled"
                min={0}
                max={CHUNITHM_MAX_SCORE}
                allowDecimal={false}
                thousandSeparator
                value={score}
                onChange={setScore}
              />
            )}
            {method === "target" && (
              <NumberInput
                label="Rating"
                variant="filled"
                min={0}
                decimalScale={2}
                step={0.01}
                value={target}
                onChange={setTarget}
              />
            )}
            <ScrollArea h={300}>
              <Table stickyHeader horizontalSpacing={0} layout="fixed">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={10}>{method === "target" ? "最低分数" : "分数"}</Table.Th>
                    <Table.Th w={5}>定数</Table.Th>
                    <Table.Th w={10}>Rating</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((row, index) => (
                    <Table.Tr key={method === "constant" ? row.score : row.constant}>
                      <Table.Td>{row.score.toLocaleString("en-US")}</Table.Td>
                      <Table.Td>{row.constant.toFixed(1)}</Table.Td>
                      <Table.Td
                        fw={500}
                        className={
                          method !== "target" && rows[index + 1] ? classes.changeLabel : undefined
                        }
                        data-label={
                          method !== "target" && rows[index + 1]
                            ? `+ ${formatChunithmValue(truncateChunithmValue(row.rating) - truncateChunithmValue(rows[index + 1].rating))}`
                            : undefined
                        }
                      >
                        {formatChunithmValue(row.rating)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {rows.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={3}>
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          {validTarget && method === "target"
                            ? "无可达到目标的定数"
                            : "请输入有效数值"}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
