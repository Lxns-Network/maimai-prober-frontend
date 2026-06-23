import { Chip, Flex, Text } from "@mantine/core";
import { ReactNode } from "react";

export interface FilterChipsOption {
  value: string;
  label: ReactNode;
}

interface FilterChipsProps {
  title: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: FilterChipsOption[];
}

export const FilterChips = ({ title, value, onChange, options }: FilterChipsProps) => {
  return (
    <div>
      <Text fz="xs" c="dimmed" mb={3}>
        {title}
      </Text>
      <Flex rowGap="xs" columnGap="md" wrap="wrap">
        <Chip.Group multiple value={value} onChange={onChange}>
          {options.map((opt) => (
            <Chip key={opt.value} variant="filled" size="xs" value={opt.value}>
              {opt.label}
            </Chip>
          ))}
        </Chip.Group>
      </Flex>
    </div>
  );
};
