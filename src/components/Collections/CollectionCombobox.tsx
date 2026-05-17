import { useCallback, useEffect, useState } from "react";
import {
  CloseButton,
  Combobox,
  InputBase,
  ScrollArea,
  Text,
  useVirtualizedCombobox,
  InputBaseProps,
  ElementProps,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { CollectionProps } from "@/types/player";
import { useVirtualizer } from "@tanstack/react-virtual";

interface CollectionComboboxProps
  extends InputBaseProps,
    ElementProps<"input", keyof InputBaseProps> {
  collections: CollectionProps[];
  loading?: boolean;
  value?: number;
  onOptionSubmit?: (value: number | null) => void;
}

const ITEM_HEIGHT = 40;

export const CollectionCombobox = ({
  collections,
  loading,
  value,
  onOptionSubmit,
  ...others
}: CollectionComboboxProps) => {
  const [search, setSearch] = useState("");
  const [filteredCollections, setFilteredCollections] = useState<CollectionProps[]>([]);
  const [opened, setOpened] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: filteredCollections.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  function onOptionSubmitHandler(index: number) {
    const collection = filteredCollections[index];
    if (!collection) return;
    onOptionSubmit && onOptionSubmit(collection.id);
    setSearch(collection.name);
    combobox.closeDropdown();
    combobox.resetSelectedOption();
  }

  const combobox = useVirtualizedCombobox({
    opened,
    onOpenedChange: setOpened,
    totalOptionsCount: filteredCollections.length,
    getOptionId: (index) =>
      filteredCollections[index] ? `collection-${filteredCollections[index].id}` : null,
    selectedOptionIndex,
    setSelectedOptionIndex: (index) => {
      setSelectedOptionIndex(index);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: "auto" });
      }
    },
    onSelectedOptionSubmit: onOptionSubmitHandler,
  });

  useEffect(() => {
    setSearch("");
  }, [collections]);

  useEffect(() => {
    setFilteredCollections(
      collections.filter((collection) => {
        if (search === "") return true;
        return (
          collection.name.toLowerCase().includes(search.toLowerCase()) ||
          (collection.description || "").toLowerCase().includes(search.toLowerCase())
        );
      }),
    );
  }, [collections, search]);

  useEffect(() => {
    const collection = collections.find((collection) => collection.id === value);
    setSearch(collection?.name || "");
  }, [collections, value]);

  const renderOption = useCallback(
    (index: number) => {
      const collection = filteredCollections[index];
      if (!collection) return null;

      return (
        <>
          <Text fz="sm" fw={500}>
            {collection.name}
          </Text>
          {collection.description !== "-" && (
            <Text fz="xs" opacity={0.6}>
              {collection.description}
            </Text>
          )}
        </>
      );
    },
    [filteredCollections],
  );

  return (
    <Combobox
      store={combobox}
      resetSelectionOnOptionHover={false}
      keepMounted
      onOptionSubmit={(value) => {
        onOptionSubmit && onOptionSubmit(parseInt(value));
        setSearch(collections.find((collection) => collection.id === parseInt(value))?.name || "");
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          placeholder="请选择收藏品"
          leftSection={<IconSearch size={18} />}
          loading={loading}
          rightSection={
            search.length !== 0 && !loading ? (
              <CloseButton
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSearch("");
                  onOptionSubmit && onOptionSubmit(null);
                }}
              />
            ) : !loading ? (
              <Combobox.Chevron />
            ) : null
          }
          rightSectionPointerEvents={search.length !== 0 ? "auto" : "none"}
          value={search}
          disabled={collections.length === 0}
          onChange={(event) => {
            combobox.openDropdown();
            setSearch(event.currentTarget.value);
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(search || "");
          }}
          {...others}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {filteredCollections.length === 0 ? (
            <Combobox.Empty>没有找到符合条件的收藏品</Combobox.Empty>
          ) : (
            <ScrollArea.Autosize
              mah={200}
              type="scroll"
              scrollbarSize={4}
              viewportRef={setScrollParent}
              onMouseDown={(event) => event.preventDefault()}
            >
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const collection = filteredCollections[virtualItem.index];
                  if (!collection) return null;
                  return (
                    <Combobox.Option
                      value={collection.id.toString()}
                      key={collection.id}
                      active={virtualItem.index === selectedOptionIndex}
                      onClick={() => onOptionSubmitHandler(virtualItem.index)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
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
  );
};
