import { Card, DataList, Divider, ScrollArea, UnstyledButton } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { type ReactNode } from "react";
import classes from "./PlayerPanel.module.css";
import profileClasses from "@/components/Profile/Profile.module.css";
import { PlayerContent } from "./PlayerModal.tsx";

export type PlayerCardFields = Parameters<typeof PlayerContent>[0]["player"];

export const PlayerCard = ({
  player,
  onClick,
  children,
}: {
  player: PlayerCardFields;
  onClick?: () => void;
  children: ReactNode;
}) => {
  const { width } = useViewportSize();
  const content = <PlayerContent player={player} editable={false} />;

  return (
    <Card className={profileClasses.card} withBorder radius="md" p={0}>
      <ScrollArea maw={width < 768 ? width - 34 : 768}>
        {onClick ? (
          <UnstyledButton
            className={`${classes.playerButton} ${classes.interactive}`}
            onClick={onClick}
          >
            {content}
          </UnstyledButton>
        ) : (
          <div className={classes.playerButton}>{content}</div>
        )}
      </ScrollArea>
      <Divider />
      <div className={classes.section}>
        <DataList size="xs">{children}</DataList>
      </div>
    </Card>
  );
};
