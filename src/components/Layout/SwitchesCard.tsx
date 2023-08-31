import { createStyles, Card, Group, Switch, Text, rem } from '@mantine/core';

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

interface SwitchesCardProps {
  title: string;
  description: string;
  data: {
    key: string;
    title: string;
    description: string;
  }[];
}

export default function SwitchesCard({ title, description, data }: SwitchesCardProps) {
  const { classes } = useStyles();

  const items = data.map((item) => (
    <Group position="apart" className={classes.item} noWrap spacing="xl" key={item.key}>
      <div>
        <Text>{item.title}</Text>
        <Text size="xs" color="dimmed">
          {item.description}
        </Text>
      </div>
      <Switch onLabel="开" offLabel="关" className={classes.switch} size="lg" />
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
      {items}
    </Card>
  );
}