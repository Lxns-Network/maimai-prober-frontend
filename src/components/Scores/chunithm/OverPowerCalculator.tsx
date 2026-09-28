import {
  Chip,
  Divider,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import {
  CHUNITHM_MAX_CONSTANT,
  CHUNITHM_MAX_SCORE,
  formatChunithmValue,
} from "@/utils/chunithm/rating.ts";
import {
  ChunithmCombo,
  getChunithmOverPower,
  requiredChunithmOverPowerScore,
} from "@/utils/chunithm/overPower.ts";

interface OverPowerCalculatorProps {
  defaultScore: number;
  defaultLevelValue?: number;
  defaultFullCombo: string;
  opened: boolean;
  onClose: () => void;
}

const combos: { value: ChunithmCombo; label: string }[] = [
  { value: "", label: "无 FC" },
  { value: "fullcombo", label: "FC" },
  { value: "alljustice", label: "AJ" },
];
const milestones = [
  { label: "S", score: 975000 },
  { label: "SS", score: 1000000 },
  { label: "SS+", score: 1005000 },
  { label: "SSS", score: 1007500 },
  { label: "SSS+", score: 1009000 },
  { label: "理论值", score: CHUNITHM_MAX_SCORE },
];
function normalizeCombo(value: string): ChunithmCombo {
  return value === "alljustice" || value === "alljusticecritical"
    ? "alljustice"
    : value === "fullcombo"
      ? "fullcombo"
      : "";
}

export function OverPowerCalculator({
  defaultScore,
  defaultLevelValue,
  defaultFullCombo,
  opened,
  onClose,
}: OverPowerCalculatorProps) {
  useBackDismiss(opened, onClose);
  const initialScore = defaultScore >= 0 ? defaultScore : 1007500;
  const [levelValue, setLevelValue] = useState<number | string>(defaultLevelValue ?? "");
  const [score, setScore] = useState<number | string>(initialScore);
  const [combo, setCombo] = useState<ChunithmCombo>(normalizeCombo(defaultFullCombo));
  const [target, setTarget] = useState<number | string>(99);
  const [method, setMethod] = useState("score");

  useEffect(() => {
    if (!opened) return;
    setLevelValue(defaultLevelValue ?? "");
    setScore(initialScore);
    setCombo(normalizeCombo(defaultFullCombo));
    setTarget(99);
    setMethod("score");
  }, [opened, defaultLevelValue, initialScore, defaultFullCombo]);

  const validConstant =
    typeof levelValue === "number" && levelValue >= 1 && levelValue <= CHUNITHM_MAX_CONSTANT;
  const validScore =
    typeof score === "number" &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= CHUNITHM_MAX_SCORE;
  const validTarget = typeof target === "number" && target >= 0 && target <= 100;
  const effectiveCombo = score === CHUNITHM_MAX_SCORE ? "alljusticecritical" : combo;
  const power =
    validConstant && validScore ? getChunithmOverPower(levelValue, score, effectiveCombo) : null;
  const targetRows =
    validConstant && validTarget
      ? combos.map(({ value, label }) => ({
          value,
          label,
          score: requiredChunithmOverPowerScore(levelValue, target, value),
        }))
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
          <Modal.Title>Over Power 计算器</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Stack gap="xs">
            <SimpleGrid cols={2} spacing="sm">
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
            </SimpleGrid>
            <Group gap="sm">
              <Text size="sm" fw={500}>
                Full Combo
              </Text>
              {score === CHUNITHM_MAX_SCORE ? (
                <Text size="sm">AJC</Text>
              ) : (
                <Chip.Group value={combo} onChange={(value) => setCombo(value as ChunithmCombo)}>
                  <Group gap="xs">
                    {combos.map((item) => (
                      <Chip key={item.value} value={item.value} size="xs">
                        {item.label}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              )}
            </Group>
            <div aria-live="polite">
              <Group justify="space-between" gap="xs">
                <Text size="sm">
                  <Text span fw={500}>
                    {power ? formatChunithmValue(power.total) : "—"}
                  </Text>
                  <Text span c="dimmed">
                    {" "}
                    / {power ? formatChunithmValue(power.maximum) : "—"}
                  </Text>
                </Text>
                <Text size="sm">
                  {power ? `${formatChunithmValue(power.percentage, 4)}%` : "—"}
                </Text>
              </Group>
              <Text size="sm" mt={4}>
                {power
                  ? power.percentage >= 100
                    ? "已达到理论值"
                    : `距离理论值还差 ${formatChunithmValue(power.maximum - power.total, 4)} OP`
                  : "请输入有效的定数和分数"}
              </Text>
            </div>
            <Divider />
            <div>
              <Text size="sm" fw={500} mb={4}>
                计算方式
              </Text>
              <Chip.Group value={method} onChange={(value) => setMethod(value as string)}>
                <Group>
                  <Chip value="score">分数</Chip>
                  <Chip value="target">完成率</Chip>
                </Group>
              </Chip.Group>
            </div>
            {method === "score" ? (
              <>
                <Table horizontalSpacing={0} layout="fixed">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w="34%">分数</Table.Th>
                      {combos.map((item) => (
                        <Table.Th key={item.value}>{item.label}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {milestones.map((item) => (
                      <Table.Tr key={item.score}>
                        <Table.Td>{item.score.toLocaleString("en-US")}</Table.Td>
                        {combos.map(({ value }) => (
                          <Table.Td key={value}>
                            {validConstant &&
                            (item.score !== CHUNITHM_MAX_SCORE || value === "alljustice")
                              ? formatChunithmValue(
                                  getChunithmOverPower(levelValue, item.score, value).total,
                                )
                              : "—"}
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            ) : (
              <>
                <NumberInput
                  label="目标完成率"
                  variant="filled"
                  min={0}
                  max={100}
                  step={0.1}
                  decimalScale={4}
                  suffix="%"
                  value={target}
                  onChange={setTarget}
                />
                <Table horizontalSpacing={0} layout="fixed">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Full Combo</Table.Th>
                      <Table.Th>最低分数</Table.Th>
                      <Table.Th>还需提分</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {targetRows.map((row) => (
                      <Table.Tr key={row.value}>
                        <Table.Td>{row.score === CHUNITHM_MAX_SCORE ? "AJC" : row.label}</Table.Td>
                        <Table.Td>
                          {row.score === null ? "无法达到" : row.score.toLocaleString("en-US")}
                        </Table.Td>
                        <Table.Td>
                          {row.score === null || !validScore
                            ? "—"
                            : score >= row.score
                              ? "分数已满足"
                              : `+${(row.score - score).toLocaleString("en-US")}`}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {targetRows.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Text size="sm" c="dimmed" ta="center">
                            请输入有效数值
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </>
            )}
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
