import { Container, Grid, Paper, Text } from "@mantine/core";
import { ChunithmPlayerProps } from "@/types/player";
import classes from "../PlayerModal.module.css";
import { Marquee } from "@/components/Marquee.tsx";
import { EditButton } from "../PlayerModal.tsx";

interface PlayerModalContentProps {
  player: ChunithmPlayerProps;
  onCollectionEdit: (collectionType: "plates" | "icons", defaultValue: number) => void;
}

export const ChunithmPlayerModalContent = ({ player, onCollectionEdit }: PlayerModalContentProps) => {
  return (
    <Container mb="md">
      <Grid>
        <Grid.Col span={6}>
          {player.name_plate && (
            <EditButton title="名牌版" description={player.name_plate.name} onClick={() => {
              onCollectionEdit("plates", player.name_plate?.id || 0);
            }} />
          )}
        </Grid.Col>
        <Grid.Col span={6}>
          {player.map_icon && (
            <EditButton title="地图头像" description={player.map_icon.name} onClick={() => {
              onCollectionEdit("icons", player.map_icon?.id || 0);
            }} />
          )}
        </Grid.Col>
        <Grid.Col span={6}>
          <Paper className={classes.subParameters}>
            <Text fz="xs" c="dimmed">上次同步时间</Text>
            <Text fz="sm">
              <Marquee>{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Marquee>
            </Text>
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
