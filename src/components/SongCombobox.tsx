import { useContext, useEffect, useState } from "react";
import {
  CloseButton,
  Combobox,
  InputBase,
  ScrollArea,
  Text,
  useCombobox,
  InputBaseProps,
  ElementProps, Group, Badge
} from "@mantine/core";
import { MaimaiSongList, MaimaiSongProps } from "../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../utils/api/song/chunithm.tsx";
import { IconSearch } from "@tabler/icons-react";
import { ApiContext } from "../App.tsx";
import { toHiragana } from 'wanakana';

interface SongComboboxProps extends InputBaseProps, ElementProps<'input', keyof InputBaseProps> {
  value?: number;
  onSearchChange?: (search: string) => void;
  onSongsChange?: (songs: (MaimaiSongProps | ChunithmSongProps)[]) => void;
  onOptionSubmit?: (value: number) => void;
}

function getFilteredSongs(songs: (MaimaiSongProps | ChunithmSongProps)[], search: string, aliases?: {
  song_id: number;
  aliases: string[];
}[]): (MaimaiSongProps | ChunithmSongProps)[] {
  const result = new Set<MaimaiSongProps | ChunithmSongProps>();
  const hiragana = toHiragana(search).toLowerCase();
  const searchLower = search.toLowerCase();
  const searchNumber = !isNaN(Number(search)) ? Number(search) : null;

  const aliasMap = new Map<number, string[]>();
  if (aliases) {
    for (const alias of aliases) {
      aliasMap.set(alias.song_id, alias.aliases.map(a => a.toLowerCase()));
    }
  }

  for (const song of songs) {
    if (searchNumber !== null && song.id === searchNumber) {
      result.add(song);
      continue;
    }

    const titleLower = song.title.toLowerCase();
    const artistLower = song.artist.toLowerCase();
    const titleHiragana = toHiragana(song.title).toLowerCase();
    const artistHiragana = toHiragana(song.artist).toLowerCase();

    if (
      titleLower.includes(searchLower) ||
      titleHiragana.includes(hiragana) ||
      artistLower.includes(searchLower) ||
      artistHiragana.includes(hiragana)
    ) {
      result.add(song);
      continue;
    }

    if (aliasMap.has(song.id)) {
      const aliasList = aliasMap.get(song.id);
      if (aliasList && aliasList.some(alias => alias.includes(searchLower))) {
        result.add(song);
      }
    }
  }

  return Array.from(result);
}

export const SongCombobox = ({ value, onSearchChange, onSongsChange, onOptionSubmit, ...others }: SongComboboxProps) => {
  const [search, setSearch] = useState('');
  const [filteredSongs, setFilteredSongs] = useState<(MaimaiSongProps | ChunithmSongProps)[]>([]);

  const context = useContext(ApiContext);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const MAX_SONGS = 100;

  useEffect(() => {
    setFilteredSongs(getFilteredSongs(context.songList.songs, search, context.aliasList.aliases));
  }, [context.songList.songs, search, context.aliasList.aliases]);

  useEffect(() => {
    onSearchChange && onSearchChange(search);
  }, [search]);

  useEffect(() => {
    onSongsChange && onSongsChange(search.length === 0 ? context.songList.songs : filteredSongs);
  }, [filteredSongs]);

  useEffect(() => {
    const song = context.songList.songs.find((song) => song.id === value);
    setSearch(song?.title || '');
  }, [value]);

  return (
    <Combobox
      position="bottom"
      middlewares={{ flip: false, shift: false }}
      store={combobox}
      onOptionSubmit={(value) => {
        onOptionSubmit && onOptionSubmit(parseInt(value));
        setSearch(context.songList.songs.find((song) => song.id === parseInt(value))?.title || '');
        combobox.closeDropdown();
      }}
      transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
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
                  setSearch('')
                  onOptionSubmit && onOptionSubmit(0);
                }}
              />
            ) : (
              <Combobox.Chevron />
            )
          }
          rightSectionPointerEvents={search.length !== 0 ? 'auto' : 'none'}
          value={search}
          disabled={context.songList.songs.length === 0}
          onChange={(event) => {
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
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
          <ScrollArea.Autosize mah={200} type="scroll">
            {filteredSongs.length === 0 && (
              <Combobox.Empty>没有找到符合条件的曲目</Combobox.Empty>
            )}
            {filteredSongs.slice(0, MAX_SONGS).map((song) => (
              <Combobox.Option value={song.id.toString()} key={song.id}>
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Text fz="sm" fw={500}>
                      {song.title}
                    </Text>
                    <Text fz="xs" opacity={0.6}>
                      {song.artist}
                    </Text>
                  </div>
                  {context.songList instanceof MaimaiSongList && song.id >= 100000 && (
                    <Badge variant="filled" color="rgb(234, 61, 232)" size="xs">
                      宴
                    </Badge>
                  )}
                  {context.songList instanceof ChunithmSongList && song.id >= 8000 && (
                    <Badge variant="filled" color="rgb(14, 45, 56)" size="xs">
                      {(song as ChunithmSongProps).difficulties[0].kanji}
                    </Badge>
                  )}
                </Group>
              </Combobox.Option>
            ))}
          </ScrollArea.Autosize>
        </Combobox.Options>
        <Combobox.Footer>
          <Text fz="xs" c="dimmed">
            最多显示 {MAX_SONGS} 条结果
          </Text>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  )
}