import { useEffect, useState } from "react";
import {
  CloseButton,
  Combobox,
  InputBase,
  ScrollArea,
  Text,
  useCombobox,
  InputBaseProps,
  ElementProps, Loader
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { PlateDataProps } from "../../pages/user/Plates.tsx";

interface PlateComboboxProps extends InputBaseProps, ElementProps<'input', keyof InputBaseProps> {
  plates: PlateDataProps[];
  value?: number;
  onOptionSubmit?: (value: number) => void;
}

export const PlateCombobox = ({ plates, value, onOptionSubmit, ...others }: PlateComboboxProps) => {
  const [search, setSearch] = useState('');
  const [filteredPlates, setFilteredPlates] = useState<PlateDataProps[]>([]);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  useEffect(() => {
    setSearch('');
  }, [plates]);

  useEffect(() => {
    setFilteredPlates(plates.filter((plate) => {
      if (search === '') return true;
      return plate.name.toLowerCase().includes(search.toLowerCase()) || plate.description.toLowerCase().includes(search.toLowerCase());
    }));
  }, [plates, search]);

  useEffect(() => {
    const plate = plates.find((plate) => plate.id === value);
    setSearch(plate?.name || '');
  }, [value]);

  return (
    <Combobox
      position="bottom"
      middlewares={{ flip: false, shift: false }}
      store={combobox}
      onOptionSubmit={(value) => {
        onOptionSubmit && onOptionSubmit(parseInt(value));
        setSearch(plates.find((plate) => plate.id === parseInt(value))?.name || '');
        combobox.closeDropdown();
      }}
      transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
    >
      <Combobox.Target>
        <InputBase
          placeholder="请选择姓名框"
          leftSection={<IconSearch size={18} />}
          rightSection={
            !plates ? (
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
          disabled={plates.length === 0}
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
            {filteredPlates.length === 0 && (
              <Combobox.Empty>没有找到符合条件的姓名框</Combobox.Empty>
            )}
            {filteredPlates.map((plate) => (
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
      </Combobox.Dropdown>
    </Combobox>
  )
}