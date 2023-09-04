import {
  Header as MantineHeader,
  Group,
  Burger,
  ActionIcon,
  createStyles,
  useMantineColorScheme,
  rem
} from '@mantine/core';
import {
  IconMoonStars,
  IconSun
} from "@tabler/icons-react";
import { NAVBAR_BREAKPOINT } from "../../App";
import Logo from "./Logo";

const useStyles = createStyles((theme) => ({
  header: {
    position: 'fixed',
    zIndex: 100,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md,
  },

  inner: {
    height: rem(56),
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  navbarToggle: {
    [theme.fn.largerThan(NAVBAR_BREAKPOINT+1)]: {
      display: 'none',
    }
  },
}));

export function ActionToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Group position="center">
      <ActionIcon
        onClick={() => toggleColorScheme()}
        size="lg"
        sx={(theme) => ({
          backgroundColor:
            theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
          color: theme.colorScheme === 'dark' ? theme.colors.yellow[4] : theme.colors.blue[6],
        })}
      >
        {colorScheme === 'dark' ? <IconSun size="1.2rem" /> : <IconMoonStars size="1.2rem" />}
      </ActionIcon>
    </Group>
  );
}

interface HeaderProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
}

export default function Header({ navbarOpened, onNavbarToggle }: HeaderProps) {
  const { classes } = useStyles();

  return (
    <MantineHeader height={56} className={classes.header} mb={120}>
      <div className={classes.inner}>
        <Group>
          <Burger className={classes.navbarToggle} opened={navbarOpened} onClick={onNavbarToggle} size="sm" />
          <Logo />
        </Group>

        <Group>
          <ActionToggle />
        </Group>
      </div>
    </MantineHeader>
  );
}