import { BoxProps, SegmentedControl } from "@mantine/core";

interface GameSegmentedControlProps extends BoxProps {
  game: "maimai" | "chunithm";
  onChange: (value: "maimai" | "chunithm") => void;
  props?: any;
}

export const GameSegmentedControl = ({ game, onChange, ...props }: GameSegmentedControlProps) => {
  return <SegmentedControl
    fullWidth
    radius="md"
    value={game || null}
    onChange={(value) => onChange(value as "maimai" | "chunithm")}
    data={[
      { label: '舞萌 DX', value: 'maimai' },
      { label: '中二节奏', value: 'chunithm' },
    ]}
    {...props}
  />
}