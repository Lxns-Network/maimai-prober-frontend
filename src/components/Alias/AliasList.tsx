import { SimpleGrid } from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { Alias } from "./Alias.tsx";
import { useSetState } from "@mantine/hooks";
import { AliasModal } from "./AliasModal.tsx";
import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

interface AliasListProps {
  aliases: AliasProps[];
  onVote: () => void;
  onDelete: () => void;
}

export const AliasList = ({ aliases, onVote, onDelete }: AliasListProps) => {
  const [parent] = useAutoAnimate();
  const [opened, setOpened] = useState(false);
  const [alias, setAlias] = useSetState<AliasProps>({} as AliasProps);
  const [displayAliases, setDisplayAliases] = useState<AliasProps[]>([]);

  useEffect(() => {
    setDisplayAliases(aliases);
  }, [aliases]);

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
      <SimpleGrid cols={2} spacing="xs" w="100%" ref={parent}>
        {displayAliases.map((alias) => (
          <Alias
            key={`${alias.song.id}:${alias.alias_id}`}
            alias={alias}
            onClick={() => {
              setAlias(alias);
              setOpened(true);
            }}
            onVote={() => onVote()}
            onDelete={onDelete}
          />
        ))}
      </SimpleGrid>
    </>
  );
}