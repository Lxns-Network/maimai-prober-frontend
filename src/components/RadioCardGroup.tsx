import { Radio, Group, Stack, Text } from '@mantine/core';
import classes from './RadioCardGroup.module.css';

interface RadioCardGroupProps {
  data: { name: string; description: string; value: string }[];
  value?: string;
  onChange?: (value: string) => void;
}

export const RadioCardGroup = ({ data, value, onChange }: RadioCardGroupProps) => {
  const cards = data.map((item) => (
    <Radio.Card className={classes.root} radius="md" value={item.value} key={item.value}>
      <Group wrap="nowrap" align="flex-start">
        <Radio.Indicator />
        <div>
          <Text className={classes.label}>{item.name}</Text>
          <Text className={classes.description} lh="xs">{item.description}</Text>
        </div>
      </Group>
    </Radio.Card>
  ));

  return <Radio.Group
    value={value}
    onChange={onChange}
  >
    <Stack gap="xs">
      {cards}
    </Stack>
  </Radio.Group>
}