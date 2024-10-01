import { Container, Grid, Paper, Text } from "@mantine/core";
import { ChunithmPlayerProps } from "@/types/player";
import classes from "../PlayerModal.module.css";
import { Marquee } from "@/components/Marquee.tsx";

export const ChunithmPlayerModalContent = ({ player }: { player: ChunithmPlayerProps }) => {
  return (
    <Container mb="md">
      <Grid>
        <Grid.Col span={6}>
          {player.name_plate && (
            <Paper className={classes.subParameters}>
              <Text fz="xs" c="dimmed">名牌版</Text>
              <Text fz="sm">
                <Marquee>{player.name_plate.name}</Marquee>
              </Text>
            </Paper>
          )}
        </Grid.Col>
        <Grid.Col span={6}>
          {player.map_icon && (
            <Paper className={classes.subParameters}>
              <Text fz="xs" c="dimmed">地图头像</Text>
              <Text fz="sm">
                <Marquee>{player.map_icon.name}</Marquee>
              </Text>
            </Paper>
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
