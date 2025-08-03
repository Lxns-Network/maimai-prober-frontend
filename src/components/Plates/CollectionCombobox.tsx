import { useEffect, useState } from "react";
import {
  CloseButton, Combobox, InputBase, ScrollArea, Text, useCombobox, InputBaseProps, ElementProps, Loader
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { CollectionProps } from "@/types/player";

interface CollectionComboboxProps extends InputBaseProps, ElementProps<'input', keyof InputBaseProps> {
  collections: CollectionProps[];
  value?: number;
  onOptionSubmit?: (value: number) => void;
}

export const CollectionCombobox = ({ collections, value, onOptionSubmit, ...others }: CollectionComboboxProps) => {
  const [search, setSearch] = useState('');
  const [filteredCollections, setFilteredCollections] = useState<CollectionProps[]>([]);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const MAX_COLLECTIONS = 100;

  useEffect(() => {
    setSearch('');
  }, [collections]);

  useEffect(() => {
    setFilteredCollections(collections.filter((collection) => {
      if (search === '') return true;
      return collection.name.toLowerCase().includes(search.toLowerCase()) || (collection.description || "").toLowerCase().includes(search.toLowerCase());
    }));
  }, [collections, search]);

  useEffect(() => {
    const collection = collections.find((collection) => collection.id === value);
    setSearch(collection?.name || '');
  }, [value]);

  return (
    <Combobox
      position="bottom"
      middlewares={{ flip: false, shift: false }}
      store={combobox}
      onOptionSubmit={(value) => {
        onOptionSubmit && onOptionSubmit(parseInt(value));
        setSearch(collections.find((collection) => collection.id === parseInt(value))?.name || '');
        combobox.closeDropdown();
      }}
      transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
    >
      <Combobox.Target>
        <InputBase
          placeholder="请选择收藏品"
          leftSection={<IconSearch size={18} />}
          rightSection={
            !collections ? (
              <Loader size={18} />
            ) : search.length !== 0 ? (
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
          disabled={collections.length === 0}
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
            {filteredCollections.length === 0 && (
              <Combobox.Empty>没有找到符合条件的收藏品</Combobox.Empty>
            )}
            {filteredCollections.slice(0, MAX_COLLECTIONS).map((plate) => (
              <Combobox.Option value={plate.id.toString()} key={plate.id}>
                <Text fz="sm" fw={500}>
                  {plate.name}
                </Text>
                <Text fz="xs" opacity={0.6}>
                  {plate.description}
                </Text>
              </Combobox.Option>
            ))}
          </ScrollArea.Autosize>
        </Combobox.Options>
        <Combobox.Footer>
          <Text fz="xs" c="dimmed">
            最多显示 {MAX_COLLECTIONS} 条结果
          </Text>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  )
}