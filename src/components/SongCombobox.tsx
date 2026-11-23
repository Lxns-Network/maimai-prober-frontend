import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Highlight, InputBaseProps, ElementProps, Group, Badge } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { MaimaiSongList, MaimaiSongProps } from "../utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "../utils/api/song/chunithm.ts";
import useSongListStore from "../hooks/useSongListStore.ts";
import useAliasListStore from "../hooks/useAliasListStore.ts";
import useGame from "@/hooks/useGame.ts";
import { VirtualizedCombobox } from "./VirtualizedCombobox.tsx";
import { isMaimaiUtageSongId, isWorldsEndSongId } from "@/utils/score.ts";
import { buildSongSearchIndex, getSongHighlightTerms, searchSongs } from "@/utils/songSearch.ts";

interface SongComboboxProps extends InputBaseProps, ElementProps<"input", keyof InputBaseProps> {
  value?: number;
  searchValue?: string;
  onSearchChange?: (search: string) => void;
  onSongsChange?: (songs: (MaimaiSongProps | ChunithmSongProps)[]) => void;
  onOptionSubmit?: (value: number) => void;
}

type SongProps = MaimaiSongProps | ChunithmSongProps;

const ITEM_HEIGHT = 52;

interface SongOptionProps {
  song: SongProps;
  songList: MaimaiSongList | ChunithmSongList;
  highlight: string[];
}

/** 文本用 `lineClamp` 而非 `truncate`：nowrap 文本会把 `ScrollArea.Autosize`（`min-width: min-content`）撑出容器。 */
export const SongOption = ({ song, songList, highlight }: SongOptionProps) => (
  <Group justify="space-between" wrap="nowrap">
    <Box miw={0} flex={1}>
      <Highlight fz="sm" fw={500} lineClamp={1} highlight={highlight}>
        {song.title}
      </Highlight>
      <Highlight fz="xs" c="dimmed" lineClamp={1} highlight={highlight}>
        {song.artist}
      </Highlight>
    </Box>
    {songList instanceof MaimaiSongList && isMaimaiUtageSongId(song.id) && (
      <Badge variant="filled" color="rgb(234, 61, 232)" size="xs">
        宴
      </Badge>
    )}
    {songList instanceof ChunithmSongList && isWorldsEndSongId(song.id) && (
      <Badge variant="filled" color="rgb(14, 45, 56)" size="xs">
        {(song as ChunithmSongProps).difficulties[0].kanji}
      </Badge>
    )}
  </Group>
);

export const SongCombobox = ({
  value,
  searchValue,
  onSearchChange,
  onSongsChange,
  onOptionSubmit,
  ...others
}: SongComboboxProps) => {
  const [game] = useGame();
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchValue ?? internalSearch;
  const [debouncedSearch] = useDebouncedValue(search, 200);

  const getAliasList = useAliasListStore((state) => state.getAliasList);

  const songList = useSongListStore((state) => state[game]);
  const aliases = getAliasList(game).aliases;
  const songs = songList?.songs;
  const searchIndex = useMemo(
    () => (songs ? buildSongSearchIndex(songs, aliases) : []),
    [aliases, songs],
  );
  const filteredSongs = useMemo(
    () => searchSongs(searchIndex, debouncedSearch),
    [searchIndex, debouncedSearch],
  );

  const setSearch = useCallback(
    (value: string) => {
      if (searchValue === undefined) {
        setInternalSearch(value);
      }
      onSearchChange && onSearchChange(value);
    },
    [onSearchChange, searchValue],
  );

  useEffect(() => {
    if (!songList) return;
    onSongsChange && onSongsChange(search.length === 0 ? songList.songs : filteredSongs);
  }, [filteredSongs, onSongsChange, search.length, songList]);

  useEffect(() => {
    if (searchValue !== undefined) return;
    if (!songList) return;
    const song = songList.songs.find((song) => song.id === value);
    setInternalSearch(song?.title || "");
  }, [searchValue, songList, value]);

  const highlightTerms = useMemo(() => getSongHighlightTerms(debouncedSearch), [debouncedSearch]);

  const renderOption = useCallback(
    (song: SongProps) => <SongOption song={song} songList={songList} highlight={highlightTerms} />,
    [songList, highlightTerms],
  );

  return (
    <VirtualizedCombobox<SongProps>
      options={filteredSongs}
      search={search}
      onSearchChange={setSearch}
      getOptionId={(song) => `song-${song.id}`}
      getOptionValue={(song) => song.id.toString()}
      renderOption={renderOption}
      onOptionSubmit={(submitted) => {
        const id = parseInt(submitted);
        onOptionSubmit && onOptionSubmit(id);
        setSearch(songList?.songs.find((song) => song.id === id)?.title || "");
      }}
      onClear={() => {
        setSearch("");
        onOptionSubmit && onOptionSubmit(0);
      }}
      placeholder="请选择曲目"
      emptyText="没有找到符合条件的曲目"
      itemHeight={ITEM_HEIGHT}
      disabled={songList?.songs.length === 0}
      loading={!songList || songList.songs.length === 0}
      {...others}
    />
  );
};
