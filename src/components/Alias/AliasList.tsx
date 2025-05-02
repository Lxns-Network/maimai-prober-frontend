import { Box, SimpleGrid } from "@mantine/core";
import { Alias } from "./Alias.tsx";
import { useSetState } from "@mantine/hooks";
import {AliasModal, calculateNewAliasWeight} from "./AliasModal.tsx";
import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { AliasProps } from "@/types/alias";

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
    <Box w="100%">
      <AliasModal alias={alias} setAlias={setAlias} opened={opened} onClose={() => setOpened(false)} />
      <SimpleGrid
        type="container"
        cols={{ base: 1, '400px': 2 }}
        spacing="xs"
        ref={parent}
      >
        {displayAliases.map((alias) => (
          <Alias
            key={`${alias.song.id}:${alias.alias_id}`}
            alias={alias}
            onClick={() => {
              if (!alias.uploader) setAlias({
                uploader: undefined,
              });
              setAlias(alias);
              setOpened(true);
            }}
            onVote={(vote) => {
              setAlias(calculateNewAliasWeight(alias, vote));
              onVote();
            }}
            onDelete={onDelete}
          />
        ))}
      </SimpleGrid>
    </Box>
  );
}