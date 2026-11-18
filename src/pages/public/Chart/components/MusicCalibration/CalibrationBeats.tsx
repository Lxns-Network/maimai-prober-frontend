import { Paper, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconHandClick } from "@tabler/icons-react";
import type { MusicCalibrationProgress } from "../../utils/musicCalibration";
import styles from "./CalibrationBeats.module.css";

const countIn = [1, 2, 3] as const;

export function CalibrationBeats({
  beat,
  tapped,
}: {
  beat: MusicCalibrationProgress["beat"];
  tapped: boolean;
}) {
  const accent = tapped || beat === 4;
  return (
    <Paper radius="md" bg="var(--mantine-color-gray-light)" px="xs" py="md" aria-hidden>
      <Stack gap="xs">
        <SimpleGrid cols={4} spacing={0} className={styles.rail}>
          {countIn.map((number) => (
            <ThemeIcon
              key={number}
              size={32}
              radius="xl"
              variant={beat === number ? "filled" : "default"}
              data-active={beat === number || undefined}
              className={styles.marker}
            >
              <Text span size="sm" fw={600} ff="monospace">
                {number}
              </Text>
            </ThemeIcon>
          ))}
          <ThemeIcon
            size={44}
            radius="md"
            variant={accent ? "filled" : "default"}
            c={accent ? undefined : "var(--mantine-primary-color-light-color)"}
            data-active={accent || undefined}
            className={styles.marker}
          >
            {tapped ? <IconCheck size={24} /> : <IconHandClick size={24} />}
          </ThemeIcon>
        </SimpleGrid>
        <SimpleGrid cols={4} spacing={0} ta="center">
          <Text size="xs" c="dimmed" className={styles.countInLabel}>
            听三拍
          </Text>
          <Text size="xs" fw={600}>
            高音时按
          </Text>
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
