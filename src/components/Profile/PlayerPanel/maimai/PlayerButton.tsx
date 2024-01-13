import {
  createStyles,
  UnstyledButton,
  UnstyledButtonProps
} from "@mantine/core";
import { MaimaiPlayerProps } from "./PlayerPanel.tsx";
import { PlayerContent } from "./PlayerContent.tsx";

const useStyles = createStyles((theme) => ({
  alias: {
    display: 'block',
    width: '100%',
    padding: theme.spacing.md,
    color: theme.colorScheme === 'dark' ? theme.colors.dark[0] : theme.black,

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
    },
  },
}));

export function PlayerButton({ player, onClick, ...others }: { player: MaimaiPlayerProps, onClick?: () => void } & UnstyledButtonProps) {
  const { classes } = useStyles();

  return (
    <UnstyledButton className={classes.alias} onClick={onClick} {...others}>
      <PlayerContent player={player} />
    </UnstyledButton>
  );
}