import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, InputBaseProps, ElementProps, Group, Badge } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { MaimaiSongList, MaimaiSongProps } from "../utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "../utils/api/song/chunithm.ts";
import { toHiragana } from "wanakana";
import useSongListStore from "../hooks/useSongListStore.ts";
import useAliasListStore from "../hooks/useAliasListStore.ts";
import useGame from "@/hooks/useGame.ts";
import { VirtualizedCombobox } from "./VirtualizedCombobox.tsx";

interface SongComboboxProps extends InputBaseProps, ElementProps<"input", keyof InputBaseProps> {
  value?: number;
  onSearchChange?: (search: string) => void;
  onSongsChange?: (songs: (MaimaiSongProps | ChunithmSongProps)[]) => void;
  onOptionSubmit?: (value: number) => void;
}

interface SongSearchIndex {
  song: MaimaiSongProps | ChunithmSongProps;
  titleLower: string;
  artistLower: string;
  titleHiragana: string;
  artistHiragana: string;
  aliasesLower: string[];
}

function buildSearchIndex(
  songs: (MaimaiSongProps | ChunithmSongProps)[],
  aliases?: { song_id: number; aliases: string[] }[],
): SongSearchIndex[] {
  const aliasMap = new Map<number, string[]>();
  if (aliases) {
    for (const alias of aliases) {
      aliasMap.set(
        alias.song_id,
        alias.aliases.map((a) => a.toLowerCase()),
      );
    }
  }

  return songs.map((song) => ({
    song,
    titleLower: song.title.toLowerCase(),
    artistLower: song.artist.toLowerCase(),
    titleHiragana: toHiragana(song.title).toLowerCase(),
    artistHiragana: toHiragana(song.artist).toLowerCase(),
    aliasesLower: aliasMap.get(song.id) || [],
  }));
}

function searchSongs(
  index: SongSearchIndex[],
  search: string,
): (MaimaiSongProps | ChunithmSongProps)[] {
  if (!search) return index.map((entry) => entry.song);

  const searchLower = search.toLowerCase();
  const searchHiragana = toHiragana(search).toLowerCase();
  const searchNumber = !isNaN(Number(search)) ? Number(search) : null;

  const result: (MaimaiSongProps | ChunithmSongProps)[] = [];

  for (const entry of index) {
    if (searchNumber !== null && entry.song.id === searchNumber) {
      result.push(entry.song);
      continue;
    }

    if (
      entry.titleLower.includes(searchLower) ||
      entry.titleHiragana.includes(searchHiragana) ||
      entry.artistLower.includes(searchLower) ||
      entry.artistHiragana.includes(searchHiragana) ||
      entry.aliasesLower.some((alias) => alias.includes(searchLower))
    ) {
      result.push(entry.song);
    }
  }

  return result;
}

type SongProps = MaimaiSongProps | ChunithmSongProps;

const ITEM_HEIGHT = 52;

export const SongCombobox = ({
  value,
  onSearchChange,
  onSongsChange,
  onOptionSubmit,
  ...others
}: SongComboboxProps) => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [game] = useGame();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 200);
  const [searchIndex, setSearchIndex] = useState<SongSearchIndex[]>([]);
  const filteredSongs = useMemo(
    () => searchSongs(searchIndex, debouncedSearch),
    [searchIndex, debouncedSearch],
  );

  const getSongList = useSongListStore((state) => state.getSongList);
  const getAliasList = useAliasListStore((state) => state.getAliasList);

  const latestSongList = getSongList(game);
  const latestAliases = getAliasList(game).aliases;

  useEffect(() => {
    setSongList(latestSongList);
    setSearchIndex(latestSongList ? buildSearchIndex(latestSongList.songs, latestAliases) : []);
  }, [latestSongList?.songs, latestAliases]);

  useEffect(() => {
    onSearchChange && onSearchChange(search);
  }, [search]);

  useEffect(() => {
    if (!songList) return;
    onSongsChange && onSongsChange(search.length === 0 ? songList.songs : filteredSongs);
  }, [filteredSongs]);

  useEffect(() => {
    if (!songList) return;
    const song = songList.songs.find((song) => song.id === value);
    setSearch(song?.title || "");
  }, [songList?.songs, value]);

  const renderOption = useCallback(
    (song: SongProps) => (
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fz="sm" fw={500} truncate>
            {song.title}
          </Text>
          <Text fz="xs" opacity={0.6} truncate>
            {song.artist}
          </Text>
        </div>
        {songList instanceof MaimaiSongList && song.id >= 100000 && (
          <Badge variant="filled" color="rgb(234, 61, 232)" size="xs">
            宴
          </Badge>
        )}
        {songList instanceof ChunithmSongList && song.id >= 8000 && (
          <Badge variant="filled" color="rgb(14, 45, 56)" size="xs">
            {(song as ChunithmSongProps).difficulties[0].kanji}
          </Badge>
        )}
      </Group>
    ),
    [songList],
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
