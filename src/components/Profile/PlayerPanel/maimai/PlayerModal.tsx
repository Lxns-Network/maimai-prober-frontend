import { Container, Grid, Paper, Text } from "@mantine/core";
import { MaimaiPlayerProps } from "@/types/player";
import classes from "../PlayerModal.module.css";
import { Marquee } from "@/components/Marquee.tsx";

export const MaimaiPlayerModalContent = ({ player }: { player: MaimaiPlayerProps }) => {
  return (
    <Container mb="md">
      <Grid>
        <Grid.Col span={6}>
          {player.name_plate && (
            <Paper className={classes.subParameters}>
              <Text fz="xs" c="dimmed">姓名框</Text>
              <Text fz="sm">
                <Marquee>{player.name_plate.name}</Marquee>
              </Text>
            </Paper>
          )}
        </Grid.Col>
        <Grid.Col span={6}>
          {player.frame && (
            <Paper className={classes.subParameters}>
              <Text fz="xs" c="dimmed">背景板</Text>
              <Text fz="sm">
                <Marquee>{player.frame.name}</Marquee>
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
  )
}
