import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import classes from "./SongTimelineSection.module.css";
import { ASSET_URL } from "@/main";
import { IconPhotoOff } from "@tabler/icons-react";
import { Avatar, Box } from "@mantine/core";
import { Game } from "@/types/game";
import LazyLoad from "@/components/LazyLoad";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { useImagePalette } from "@/hooks/useImagePalette.ts";

const SongImage = ({ game, id, alt }: { game: Game; id: number; alt: string }) => {
  const src = `${ASSET_URL}/${game}/jacket/${id}.png!webp`;
  const colors = useImagePalette(src);

  return (
    <Box
      className={classes.jacket}
      style={{
        "--primary-color": colors && colors[0],
        "--secondary-color": colors && colors[1],
      }}
    >
      <Avatar src={src} alt={alt} imageProps={{ loading: "lazy" }} size={115} radius="md" mx="auto">
        <IconPhotoOff />
      </Avatar>
    </Box>
  );
};

export const SongTimelineSection = ({ data }: { data: YearInReviewProps }) => {
  const { songList } = useSongListStore(useShallow((state) => ({ songList: state[data.game] })));

  return (
    <div className={classes.timeline}>
      {Object.entries(data.player_song_timeline).map(([month, songIds]) => (
        <div key={month} className={classes.timelineMonth}>
          <div className={classes.timelineMonthTitle}>{month} 月</div>
          <div className={classes.timelineMonthContent}>
            {songIds.map((id) => {
              const song = songList?.find(id);
              return (
                <div key={id} className={classes.timelineMonthContentItem}>
                  <LazyLoad height={115} offset={200}>
                    <SongImage
                      game={data.game}
                      id={songList?.getSongResourceId(id)}
                      alt={`${song?.title || "未知曲目"} 曲绘`}
                    />
                  </LazyLoad>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
