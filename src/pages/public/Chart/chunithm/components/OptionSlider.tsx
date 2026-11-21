import { Box, Group, Slider, Text } from "@mantine/core";

export function OptionSlider({
  label,
  value,
  options,
  markValue,
  startPointValue,
  disabled,
  onChange,
  onChangeEnd,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  markValue?: string;
  startPointValue?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onChangeEnd?: (value: string) => void;
}) {
  const index = options.findIndex((option) => option.value === value);
  const mark =
    markValue === undefined
      ? Math.floor((options.length - 1) / 2)
      : options.findIndex((option) => option.value === markValue);
  const interiorMark = mark > 0 && mark < options.length - 1;
  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="sm" c="dimmed" ff="monospace">
          {options[index]?.label ?? "—"}
        </Text>
      </Group>
      <Slider
        thumbLabel={label}
        thumbValueText={options[index]?.label}
        min={0}
        max={Math.max(1, options.length - 1)}
        step={1}
        startPointValue={
          startPointValue === undefined
            ? undefined
            : options.findIndex((option) => option.value === startPointValue)
        }
        value={Math.max(0, index)}
        label={(next) => options[next]?.label}
        marks={interiorMark ? [{ value: mark }] : []}
        onChange={(next) => onChange(options[next].value)}
        onChangeEnd={onChangeEnd && ((next) => onChangeEnd(options[next].value))}
        disabled={disabled || options.length < 2}
        onKeyDown={(event) => {
          if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")
            event.stopPropagation();
        }}
      />
      <Group justify="space-between" pos="relative">
        <Text size="xs" c="dimmed" ff="monospace">
          {options[0]?.label}
        </Text>
        {interiorMark && (
          <Box pos="absolute" left={8} right={8} top={0}>
            <Text
              size="xs"
              c="dimmed"
              ff="monospace"
              pos="absolute"
              left={`${(mark / (options.length - 1)) * 100}%`}
              style={{ transform: "translateX(-50%)" }}
            >
              {options[mark].label}
            </Text>
          </Box>
        )}
        <Text size="xs" c="dimmed" ff="monospace">
          {options[options.length - 1]?.label}
        </Text>
      </Group>
    </div>
  );
}
