import { SimpleGrid } from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { Alias } from "./Alias.tsx";
import { useLocalStorage } from "@mantine/hooks";

export const AliasList = ({ aliases, onDelete }: { aliases: AliasProps[], onDelete: () => void }) => {
  const [game] = useLocalStorage({ key: 'game' });

  return (
    <SimpleGrid cols={2} spacing="xs" w="100%">
      {aliases.map((alias) => (
        <Alias key={`${game}-${alias.alias_id}`} alias={alias} onDelete={onDelete} />
      ))}
    </SimpleGrid>
  );
}