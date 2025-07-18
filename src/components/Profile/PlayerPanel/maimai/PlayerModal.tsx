import { Container, Grid, Paper, Text } from "@mantine/core";
import { MaimaiPlayerProps } from "@/types/player";
import classes from "../PlayerModal.module.css";
import { Marquee } from "@/components/Marquee.tsx";
import { EditButton } from "../PlayerModal.tsx";

interface PlayerModalContentProps {
  player: MaimaiPlayerProps;
  onCollectionEdit: (collectionType: "plates" | "frames", defaultValue: number) => void;
}

export const MaimaiPlayerModalContent = ({ player, onCollectionEdit }: PlayerModalContentProps) => {
  return (
    <Container mb="md">
      <Grid>
        <Grid.Col span={6}>
          {player.name_plate && (
            <EditButton title="姓名框" description={player.name_plate.name} onClick={() => {
              onCollectionEdit("plates", player.name_plate?.id || 0);
            }} />
          )}
        </Grid.Col>
        <Grid.Col span={6}>
          {player.frame && (
            <EditButton title="背景" description={player.frame.name} onClick={() => {
              onCollectionEdit("frames", player.frame?.id || 0);
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
  )
}
