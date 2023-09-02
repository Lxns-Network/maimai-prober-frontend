import {createStyles, Card, Group, Switch, Text, rem, Select, MultiSelect, Button} from '@mantine/core';

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  item: {
    '& + &': {
      paddingTop: theme.spacing.sm,
      marginTop: theme.spacing.sm,
      borderTop: `${rem(1)} solid ${
        theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
      }`,
    },
  },

  switch: {
    '& *': {
      cursor: 'pointer',
    },
  },

  title: {
    lineHeight: 1,
  },
}));

interface OptionsProps {
  value: string;
  label: string;
}

interface SettingsProps {
  key: string;
  title: string;
  description: string;
  optionType: 'switch' | 'select' | 'multi-select' | 'button';
  // 可选参数
  placeholder?: string;
  color?: string; // 选项类型为 'button' 时需要
  defaultValue?: string | boolean | string[]; // string[] 选项类型为 'multi-select' 时需要
  options?: OptionsProps[]; // 选项类型为 'select' 或 'multi-select' 时需要
  onChange?: (value: any) => void; // 选项更改时的回调函数
  onClick?: () => void; // 选项类型为 'button' 时需要
}

interface SettingsCardProps {
  title: string;
  description: string;
  data: SettingsProps[];
}

export default function SettingsCard({ title, description, data }: SettingsCardProps) {
  const { classes } = useStyles();

  const settings = data.map((item) => (
    <Group position="apart" className={classes.item} noWrap spacing="xl" key={item.key}>
      <div>
        <Text>{item.title}</Text>
        <Text size="xs" color="dimmed">
          {item.description}
        </Text>
      </div>
      {item.optionType === 'switch' && (
        <Switch
          onLabel="开"
          offLabel="关"
          className={classes.switch}
          size="lg"
          defaultChecked={item.defaultValue as boolean}
        />
      )}
      {item.optionType === 'select' && (
        <Select
          mt="md"
          withinPortal
          data={item.options || []}
          defaultValue={item.defaultValue as string}
        />
      )}
      {item.optionType === 'multi-select' && (
        <MultiSelect
          data={item.options || []}
          placeholder={item.placeholder}
          defaultValue={item.defaultValue as string[]}
        />
      )}
      {item.optionType === 'button' && (
        <Button
          variant="outline"
          color={item.color || 'default'}
          onClick={item.onClick}
        >
          {item.placeholder}
        </Button>
      )}
    </Group>
  ));

  return (
    <Card withBorder radius="md" p="xl" className={classes.card} mb="md">
      <Text fz="lg" className={classes.title} fw={700}>
        {title}
      </Text>
      <Text fz="xs" c="dimmed" mt={3} mb="xl">
        {description}
      </Text>
      {settings}
    </Card>
  );
}