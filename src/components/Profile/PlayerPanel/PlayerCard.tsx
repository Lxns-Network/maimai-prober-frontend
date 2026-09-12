import { Card, DataList, Divider, ScrollArea, UnstyledButton } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { type ReactNode } from "react";
import classes from "./PlayerPanel.module.css";
import profileClasses from "@/components/Profile/Profile.module.css";
import { PlayerContent } from "./PlayerModal.tsx";

/**
 * 名片只读字段的联合类型。不要求 `friend_code`，因此本人资料与好友资料可以共用同一张名片。
 */
export type PlayerCardFields = Parameters<typeof PlayerContent>[0]["player"];

/**
 * 账号详情与好友资料共用的游戏内名片。
 *
 * 传入 `onClick` 时整块名片可点击（用于打开玩家详情），否则仅展示。
 * `children` 为名片下方的 `DataList.Item`，由调用方决定补充哪些信息行。
 */
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
