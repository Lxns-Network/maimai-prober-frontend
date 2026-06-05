import { useCallback, useEffect, useState } from "react";
import { Text, InputBaseProps, ElementProps } from "@mantine/core";
import { CollectionProps } from "@/types/player";
import { VirtualizedCombobox } from "@/components/VirtualizedCombobox.tsx";

interface CollectionComboboxProps
  extends InputBaseProps,
    ElementProps<"input", keyof InputBaseProps> {
  collections: CollectionProps[];
  loading?: boolean;
  value?: number;
  onOptionSubmit?: (value: number | null) => void;
}

const ITEM_HEIGHT = 52;

export const CollectionCombobox = ({
  collections,
  loading,
  value,
  onOptionSubmit,
  ...others
}: CollectionComboboxProps) => {
  const [search, setSearch] = useState("");
  const [filteredCollections, setFilteredCollections] = useState<CollectionProps[]>([]);

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
    (collection: CollectionProps) => (
      <>
        <Text fz="sm" fw={500} truncate>
          {collection.name}
        </Text>
        {collection.description !== "-" && (
          <Text fz="xs" opacity={0.6} truncate>
            {collection.description}
          </Text>
        )}
      </>
    ),
    [],
  );

  return (
    <VirtualizedCombobox<CollectionProps>
      options={filteredCollections}
      search={search}
      onSearchChange={setSearch}
      getOptionId={(collection) => `collection-${collection.id}`}
      getOptionValue={(collection) => collection.id.toString()}
      renderOption={renderOption}
      onOptionSubmit={(submitted) => {
        const id = parseInt(submitted);
        onOptionSubmit && onOptionSubmit(id);
        setSearch(collections.find((collection) => collection.id === id)?.name || "");
      }}
      onClear={() => {
        setSearch("");
        onOptionSubmit && onOptionSubmit(null);
      }}
      placeholder="请选择收藏品"
      emptyText="没有找到符合条件的收藏品"
      itemHeight={ITEM_HEIGHT}
      disabled={collections.length === 0}
      loading={loading}
      {...others}
    />
  );
};
