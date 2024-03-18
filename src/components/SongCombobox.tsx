import { useEffect, useState } from "react";
import {
  CloseButton,
  Combobox,
  InputBase,
  ScrollArea,
  Text,
  useCombobox,
  InputBaseProps,
  ElementProps
} from "@mantine/core";
import { MaimaiSongProps } from "../utils/api/song/maimai.tsx";
import { ChunithmSongProps } from "../utils/api/song/chunithm.tsx";
import { IconSearch } from "@tabler/icons-react";

interface SongComboboxProps extends InputBaseProps, ElementProps<'input', keyof InputBaseProps> {
  songs: (MaimaiSongProps | ChunithmSongProps)[];
  aliases?: {
    song_id: number;
    aliases: string[];
  }[];
  value?: number;
  onSearchChange?: (search: string) => void;
  onSongsChange?: (songs: (MaimaiSongProps | ChunithmSongProps)[]) => void;
  onOptionSubmit?: (value: number) => void;
}

function getFilteredSongs(songs: (MaimaiSongProps | ChunithmSongProps)[], search: string, aliases?: SongComboboxProps["aliases"]) {
  const result: (MaimaiSongProps | ChunithmSongProps)[] = [];

  for (let i = 0; i < songs.length; i += 1) {
    const song = songs[i];
    const titleMatch = song.title.toLowerCase().includes(search.toLowerCase());
    const artistMatch = song.artist.toLowerCase().includes(search.toLowerCase());

    if ((titleMatch || artistMatch) && !result.includes(song)) {
      result.push(song);
    }

    if (aliases) {
      for (let j = 0; j < aliases.length; j += 1) {
        const alias = aliases[j];
        const aliasMatch = alias.aliases.some((aliasText) => aliasText.toLowerCase().includes(search.toLowerCase()));

        if (aliasMatch && alias.song_id === song.id && !result.includes(song)) {
          result.push(song);
        }
      }
    }
  }

  return result
}

export const SongCombobox = ({ songs, aliases, value, onSearchChange, onSongsChange, onOptionSubmit, ...others }: SongComboboxProps) => {
  const [search, setSearch] = useState('');
  const [filteredSongs, setFilteredSongs] = useState<(MaimaiSongProps | ChunithmSongProps)[]>([]);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const MAX_SONGS = 100;

  useEffect(() => {
    setSearch('');
  }, [songs, aliases]);

  useEffect(() => {
    setFilteredSongs(getFilteredSongs(songs, search, aliases));
  }, [songs, search, aliases]);

  useEffect(() => {
    onSearchChange && onSearchChange(search);
  }, [search]);

  useEffect(() => {
    onSongsChange && onSongsChange(search.length === 0 ? songs : filteredSongs);
  }, [filteredSongs]);

  useEffect(() => {
    const song = songs.find((song) => song.id === value);
    setSearch(song?.title || '');
  }, [value]);

  return (
    <Combobox
      position="bottom"
      middlewares={{ flip: false, shift: false }}
      store={combobox}
      onOptionSubmit={(value) => {
        onOptionSubmit && onOptionSubmit(parseInt(value));
        setSearch(songs.find((song) => song.id === parseInt(value))?.title || '');
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
          disabled={songs.length === 0}
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
                <Text fz="sm" fw={500}>
                  {song.title}
                </Text>
                <Text fz="xs" opacity={0.6}>
                  {song.artist}
                </Text>
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