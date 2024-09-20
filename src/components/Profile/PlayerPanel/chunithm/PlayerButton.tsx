import {
  UnstyledButton,
  UnstyledButtonProps
} from "@mantine/core";
import { ChunithmPlayerProps } from "@/types/player";
import { PlayerContent } from "./PlayerContent.tsx";
import classes from "../PlayerPanel.module.css"

export function PlayerButton({ player, onClick, ...others }: { player: ChunithmPlayerProps, onClick?: () => void } & UnstyledButtonProps) {
  return (
    <UnstyledButton className={classes.playerButton} onClick={onClick} {...others}>
      <PlayerContent player={player} />
    </UnstyledButton>
  );
}