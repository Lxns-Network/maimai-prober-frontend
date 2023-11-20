import { SimpleGrid } from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { Alias } from "./Alias.tsx";
import {useLocalStorage, useSetState} from "@mantine/hooks";
import {AliasModal} from "./AliasModal.tsx";
import {useEffect, useState} from "react";

export const AliasList = ({ aliases, onDelete }: { aliases: AliasProps[], onDelete: () => void }) => {
  const [game] = useLocalStorage({ key: 'game' });
  const [opened, setOpened] = useState(false);
  const [alias, setAlias] = useSetState<AliasProps>({} as AliasProps);
  const [displayAliases, setDisplayAliases] = useState<AliasProps[]>([]);

  useEffect(() => {
    setDisplayAliases(aliases);
  }, []);

  useEffect(() => {
    if (alias.alias_id) {
      const newDisplayAliases = displayAliases;
      const index = displayAliases.findIndex((a) => a.alias_id === alias.alias_id);
      if (index !== -1) {
        newDisplayAliases[index] = alias;
      }
      setDisplayAliases(newDisplayAliases);
    }
  }, [alias]);

  return (
    <>
      <AliasModal alias={alias} setAlias={setAlias} opened={opened} onClose={() => setOpened(false)} />
      <SimpleGrid cols={2} spacing="xs" w="100%">
        {displayAliases.map((alias) => (
          <Alias
            key={`${game}-${alias.alias_id}`}
            alias={alias}
            onClick={() => {
              setAlias(alias);
              setOpened(true);
            }}
            onDelete={onDelete}
          />
        ))}
      </SimpleGrid>
    </>
  );
}