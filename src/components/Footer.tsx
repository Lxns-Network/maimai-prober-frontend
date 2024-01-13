import { createStyles, Divider, Flex, Group, Image, rem, Text } from "@mantine/core";

const useStyles = createStyles((theme) => ({
  link: {
    color: "dimmed",
    fontSize: theme.fontSizes.sm,

    '&:hover': {
      textDecoration: "underline",
    },
  },

  footer: {
    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
    borderTop: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,

    [theme.fn.smallerThan('xs')]: {
      padding: `${theme.spacing.xs} 0`,
    },
  },
}));

export const Footer = () => {
  const { classes } = useStyles();

  return (
    <div className={classes.footer}>
      <Flex align="center" p="md" gap="xs" justify="space-between" sx={(theme) => ({
        [theme.fn.smallerThan('xs')]: {
          flexDirection: "column",
        },
      })}>
        <Group style={{ flex: 1 }}>
          <Image src="/favicon.webp" width={32} height={32} />
          <Text fw={700} fz={18}>
            maimai DX 查分器
          </Text>
        </Group>
        <Group>
          <Text size="sm" color="dimmed">&copy; {new Date().getFullYear() + ' '}
            <Text<'a'>
              component="a"
              className={classes.link}
              href="https://lxns.net/"
              target="_blank"
            >
              Lxns Network
            </Text>
          </Text>
          <Divider orientation="vertical" />
          <Text<'a'>
            component="a"
            className={classes.link}
            size="sm"
            color="dimmed"
            href="https://beian.miit.gov.cn/"
            target="_blank"
          >
            粤ICP备18035696号
          </Text>
        </Group>
      </Flex>
    </div>
  )
}