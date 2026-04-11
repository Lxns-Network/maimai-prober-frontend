import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CloseButton, Combobox, InputBase, ScrollArea, Text, useVirtualizedCombobox, InputBaseProps, ElementProps, Group, Badge
} from "@mantine/core";
import { MaimaiSongList, MaimaiSongProps } from "../utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "../utils/api/song/chunithm.ts";
import { IconSearch } from "@tabler/icons-react";
import { toHiragana } from 'wanakana';
import { useVirtualizer } from '@tanstack/react-virtual';
import useSongListStore from "../hooks/useSongListStore.ts";
import useAliasListStore from "../hooks/useAliasListStore.ts";
import useGame from "@/hooks/useGame.ts";

interface SongComboboxProps extends InputBaseProps, ElementProps<'input', keyof InputBaseProps> {
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
  aliases?: { song_id: number; aliases: string[] }[]
): SongSearchIndex[] {
  const aliasMap = new Map<number, string[]>();
  if (aliases) {
    for (const alias of aliases) {
      aliasMap.set(alias.song_id, alias.aliases.map(a => a.toLowerCase()));
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

function searchSongs(index: SongSearchIndex[], search: string): (MaimaiSongProps | ChunithmSongProps)[] {
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
      entry.aliasesLower.some(alias => alias.includes(searchLower))
    ) {
      result.push(entry.song);
    }
  }

  return result;
}

const ITEM_HEIGHT = 48;

export const SongCombobox = ({ value, onSearchChange, onSongsChange, onOptionSubmit, ...others }: SongComboboxProps) => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [game] = useGame();
  const [search, setSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState<SongSearchIndex[]>([]);
  const filteredSongs = useMemo(() => searchSongs(searchIndex, search), [searchIndex, search]);
  const [opened, setOpened] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  const getSongList = useSongListStore((state) => state.getSongList);
  const getAliasList = useAliasListStore((state) => state.getAliasList);

  const virtualizer = useVirtualizer({
    count: filteredSongs.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  function onOptionSubmitHandler(index: number) {
    const song = filteredSongs[index];
    if (!song) return;
    onOptionSubmit && onOptionSubmit(song.id);
    setSearch(song.title);
    combobox.closeDropdown();
    combobox.resetSelectedOption();
  }

  const combobox = useVirtualizedCombobox({
    opened,
    onOpenedChange: setOpened,
    totalOptionsCount: filteredSongs.length,
    getOptionId: (index) => filteredSongs[index] ? `song-${filteredSongs[index].id}` : null,
    selectedOptionIndex,
    setSelectedOptionIndex: (index) => {
      setSelectedOptionIndex(index);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: 'auto' });
      }
    },
    onSelectedOptionSubmit: onOptionSubmitHandler,
  });

  useEffect(() => {
    const newSongList = getSongList(game);
    setSongList(newSongList);
    setSearchIndex(newSongList ? buildSearchIndex(newSongList.songs, getAliasList(game).aliases) : []);
  }, [game]);

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
    setSearch(song?.title || '');
  }, [songList?.songs, value]);

  const renderOption = useCallback((index: number) => {
    const song = filteredSongs[index];
    if (!song) return null;

    return (
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text fz="sm" fw={500}>{song.title}</Text>
          <Text fz="xs" opacity={0.6}>{song.artist}</Text>
        </div>
        {songList instanceof MaimaiSongList && song.id >= 100000 && (
          <Badge variant="filled" color="rgb(234, 61, 232)" size="xs">宴</Badge>
        )}
        {songList instanceof ChunithmSongList && song.id >= 8000 && (
          <Badge variant="filled" color="rgb(14, 45, 56)" size="xs">
            {(song as ChunithmSongProps).difficulties[0].kanji}
          </Badge>
        )}
      </Group>
    );
  }, [filteredSongs, songList]);

  return (
    <Combobox
      store={combobox}
      resetSelectionOnOptionHover={false}
      keepMounted
      onOptionSubmit={(value) => {
        onOptionSubmit && onOptionSubmit(parseInt(value));
        setSearch(songList?.songs.find((song) => song.id === parseInt(value))?.title || '');
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          placeholder="请选择曲目"
          leftSection={<IconSearch size={18} />}
          rightSection={
            search.length !== 0 && !others.disabled ? (
              <CloseButton
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSearch('');
                  onOptionSubmit && onOptionSubmit(0);
                }}
              />
            ) : (
              <Combobox.Chevron />
            )
          }
          rightSectionPointerEvents={search.length !== 0 ? 'auto' : 'none'}
          value={search}
          disabled={songList?.songs.length === 0}
          onChange={(event) => {
            combobox.openDropdown();
            setSearch(event.currentTarget.value);
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(search || '');
          }}
          {...others}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {filteredSongs.length === 0 ? (
            <Combobox.Empty>没有找到符合条件的曲目</Combobox.Empty>
          ) : (
            <ScrollArea.Autosize
              mah={200}
              type="scroll"
              scrollbarSize={4}
              viewportRef={setScrollParent}
              onMouseDown={(event) => event.preventDefault()}
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const song = filteredSongs[virtualItem.index];
                  if (!song) return null;
                  return (
                    <Combobox.Option
                      value={song.id.toString()}
                      key={song.id}
                      active={virtualItem.index === selectedOptionIndex}
                      onClick={() => onOptionSubmitHandler(virtualItem.index)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualItem.size,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {renderOption(virtualItem.index)}
                    </Combobox.Option>
                  );
                })}
              </div>
            </ScrollArea.Autosize>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
