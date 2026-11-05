import { Box, Card, DataList, Divider, ScrollArea, UnstyledButton } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { type ReactNode } from "react";
import { ChunithmSummary, MaimaiSummary } from "@/components/Friends/FriendCard";
import { isChunithmPlayerProps, isMaimaiPlayerProps } from "@/utils/api/player.ts";
import classes from "./PlayerPanel.module.css";
import profileClasses from "@/components/Profile/Profile.module.css";
import { PlayerContent } from "./PlayerModal.tsx";

export type PlayerCardFields = Parameters<typeof PlayerContent>[0]["player"];

/**
 * 窄屏下完整的玩家信息排不下，改用好友卡片的紧凑摘要；点击后的玩家详情不受影响。
 * 紧凑摘要再窄就会挤压称号和名字，因此给它保底宽度，更窄时交给外层横向滚动。
 */
const COMPACT_BELOW = "sm";
const COMPACT_MIN_WIDTH = 300;

export const PlayerCard = ({
  player,
  onClick,
  children,
}: {
  player: PlayerCardFields;
  onClick?: () => void;
  children?: ReactNode;
}) => {
  const { width } = useViewportSize();
  const content = (
    <>
      <Box hiddenFrom={COMPACT_BELOW} px="md" miw={COMPACT_MIN_WIDTH}>
        {isMaimaiPlayerProps(player) && <MaimaiSummary profile={player} />}
        {isChunithmPlayerProps(player) && <ChunithmSummary profile={player} />}
      </Box>
      <Box visibleFrom={COMPACT_BELOW}>
        <PlayerContent player={player} editable={false} />
      </Box>
    </>
  );

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
      {children && (
        <>
          <Divider />
          <div className={classes.section}>
            <DataList size="xs">{children}</DataList>
          </div>
        </>
      )}
    </Card>
  );
};
