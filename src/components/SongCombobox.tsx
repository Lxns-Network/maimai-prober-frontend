import { useEffect, useState } from "react";
import { CloseButton, Combobox, InputBase, ScrollArea, Text, useCombobox, InputBaseProps } from "@mantine/core";
import Icon from "@mdi/react";
import { mdiMagnify } from "@mdi/js";
import { MaimaiSongProps } from "../utils/api/song/maimai.tsx";
import { ChunithmSongProps } from "../utils/api/song/chunithm.tsx";
import { AliasProps } from "../pages/alias/Vote.tsx";

interface SongComboboxProps extends InputBaseProps {
  songs: (MaimaiSongProps | ChunithmSongProps)[];
  aliases?: AliasProps[];
  value: number;
  onSearchChange?: (value: string) => void;
  onOptionSubmit?: (value: number) => void;
}

function getFilteredSongs(songs: (MaimaiSongProps | ChunithmSongProps)[], search: string, limit: number) {
  const result: (MaimaiSongProps | ChunithmSongProps)[] = [];

  for (let i = 0; i < songs.length; i += 1) {
    if (result.length === limit) {
      break;
    }

    if (songs[i].title.toLowerCase().includes(search.toLowerCase()) || songs[i].artist.toLowerCase().includes(search.toLowerCase())) {
      result.push(songs[i]);
    }
  }

  return result;
}

export const SongCombobox = ({ songs, aliases, value, onSearchChange, onOptionSubmit, ...others }: SongComboboxProps) => {
  const [search, setSearch] = useState('');
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const filteredSongs = getFilteredSongs(songs, search, 100)

  useEffect(() => {
    onSearchChange && onSearchChange(search);
  }, [search]);

  useEffect(() => {
    const song = songs.find((song) => song.id === value);
    setSearch(song?.title || '');
  }, [value]);

  return (
    <Combobox
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
          leftSection={<Icon path={mdiMagnify} size={0.8} />}
          rightSection={
            search.length !== 0 ? (
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
          rightSectionPointerEvents={value === null ? 'none' : 'auto'}
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
            {filteredSongs.map((song) => (
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
            最多显示 100 条结果
          </Text>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  )
}