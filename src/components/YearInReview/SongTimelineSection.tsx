import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import classes from "./SongTimelineSection.module.css";
import { ASSET_URL } from "@/main.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { Avatar, Box } from "@mantine/core";
import {useEffect, useState} from "react";
import { ColorExtractor } from "react-color-extractor";
import { Game } from "@/types/game";
import LazyLoad, { forceCheck } from "react-lazyload";
import useSongListStore from "@/hooks/useSongListStore.ts";
import {useShallow} from "zustand/react/shallow";

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
        <Avatar src={`${ASSET_URL}/${game}/jacket/${id}.png!webp`} size={115} radius="md" mx="auto">
          <IconPhotoOff />
        </Avatar>
      </Box>
    </>
  )
}

export const SongTimelineSection = ({ data }: { data: YearInReviewProps }) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state[data.game] })),
  );

  useEffect(() => {
    const scrollArea = document.querySelector(
      "#shell-root>.mantine-ScrollArea-root>.mantine-ScrollArea-viewport"
    );

    if (!scrollArea) return;

    forceCheck();

    scrollArea.addEventListener("scroll", forceCheck);

    return () => {
      scrollArea.removeEventListener("scroll", forceCheck);
    };
  }, []);

  return (
    <div className={classes.timeline}>
      {Object.entries(data.player_song_timeline).map(([month, songIds]) => (
        <div key={month} className={classes.timelineMonth}>
          <div className={classes.timelineMonthTitle}>{month} 月</div>
          <div className={classes.timelineMonthContent}>
            {songIds.map((id) => (
              <div key={id} className={classes.timelineMonthContentItem}>
                <LazyLoad height={115} offset={200}>
                  <SongImage game={data.game} id={songList?.getSongResourceId(id)} />
                </LazyLoad>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}