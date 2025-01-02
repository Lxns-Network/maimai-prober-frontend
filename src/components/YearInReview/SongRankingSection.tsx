import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import {
  Box, Card, Text, Avatar, Stack, Indicator, Group, Badge, rem, NumberFormatter, Divider, Grid, Paper,
  useMantineTheme,
} from "@mantine/core";
import classes from './SongRankingSection.module.css';
import { ASSET_URL } from "@/main.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { useState } from "react";
import { ColorExtractor } from "react-color-extractor";
import { Game } from "@/types/game";
import { useMediaQuery } from "@mantine/hooks";

const SongImage = ({ game, id }: { game: Game, id: number }) => {
  const [colors, setColors] = useState<string[]>([]);

  return (
    <>
      <ColorExtractor
        src={`${ASSET_URL}/${game}/jacket/${id}.png!webp`}
        getColors={(colors: string[]) => setColors(colors)}
      />
      <Box className={classes.jacket} style={{
        '--primary-color': colors && colors[0],
        '--secondary-color': colors && colors[1]
      }}>
        <Avatar src={`${ASSET_URL}/${game}/jacket/${id}.png!webp`} size={94} radius="md" mx="auto">
          <IconPhotoOff />
        </Avatar>
      </Box>
    </>
  )
}

export const SongRankingSection = ({ data }: { data: YearInReviewProps }) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state[data.game] })),
  );
  const theme = useMantineTheme();
  const small = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const sortedEntries = Object.entries(data.player_most_uploaded_songs)
    .sort((a, b) => b[1] - a[1]);
  while (sortedEntries.length < 10) {
    sortedEntries.push(["0", 0]);
  }

  const songCards = sortedEntries.slice(0, 3).map(([key, value], index) => {
    const song = songList.find(parseInt(key));

    return (
      <Grid.Col
        key={key}
        span={small ? 12 : 4}
        order={small ? index : [1, 0, 2][index]}
        mt={small ? 0 : [0, 50, 100][index]}
      >
        <Indicator
          position="top-center"
          h="100%"
          label={<Text fz="lg" fw={700}>{index + 1}</Text>}
          size={32}
          color={["yellow", "gray", "orange"][index]}
          zIndex={1}
        >
          <Card h="100%" withBorder shadow="md" radius="md" className={classes.card} padding="xl" ta="center">
            <SongImage game={data.game} id={parseInt(key)} />
            {value === 0 ? (
              <Text fz="xl" fw={500} lh="xs" className={classes.cardTitle} mt="md">
                虚位以待
              </Text>
            ) : (
              <>
                <Text fz="xl" fw={500} lh="xs" className={classes.cardTitle} mt="md">
                  {song ? song.title : "未知曲目"}
                </Text>
                <Text c="dimmed" mt={4}>
                  {song ? song.artist : "未知艺术家"}
                </Text>
                <Text c="dimmed" mt="sm">
                  {value} 次上传
                </Text>
              </>
            )}
          </Card>
        </Indicator>
      </Grid.Col>
    );
  });

  return (
    <div>
      <Grid gutter="xl" mt={50}>
        {songCards}
      </Grid>
      <Paper radius="md" mt={32} p={0}>
        <Stack gap={0}>
          {sortedEntries.slice(3).map(([key, value], index) => {
            const song = songList.find(parseInt(key));

            return <>
              <Box key={index} w="100%" style={{
                marginTop: index === 0 ? 0 : rem(8),
                marginBottom: index === sortedEntries.length - 4 ? 0 : rem(8),
              }}>
                <Group>
                  <Badge variant="light" color="blue" size="xl" circle>
                    {index + 4}
                  </Badge>
                  <div style={{ flex: 1 }}>
                    {value === 0 ? (
                      <Text fz="xl" style={{ flex: 1 }}>
                        虚位以待
                      </Text>
                    ) : (
                      <>
                        <Text fz="xl">
                          {song ? song.title : "未知曲目"}
                        </Text>
                        <Text c="dimmed">
                          {song ? song.artist : "未知艺术家"}
                        </Text>
                      </>
                    )}
                  </div>
                  <Text fz={rem(18)} style={{ lineHeight: rem(18) }}>
                    <NumberFormatter value={value} thousandSeparator />
                  </Text>
                </Group>
              </Box>
              {index !== sortedEntries.length - 4 && <Divider variant="dashed" />}
            </>;
          })}
        </Stack>
      </Paper>
    </div>
  )
}