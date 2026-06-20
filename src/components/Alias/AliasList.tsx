import { Box } from "@mantine/core";
import { Alias } from "./Alias.tsx";
import { useSetState } from "@mantine/hooks";
import { AliasModal, calculateNewAliasWeight } from "./AliasModal.tsx";
import { useEffect, useState } from "react";
import { AnimatedGrid } from "@/components/AnimatedGrid.tsx";
import { AliasProps } from "@/types/alias";

interface AliasListProps {
  aliases: AliasProps[];
  onVote: () => void;
  onMutate: () => void;
}

const aliasKey = (alias: AliasProps) => `${alias.song.id}:${alias.alias_id}`;

export const AliasList = ({ aliases, onVote, onMutate }: AliasListProps) => {
  const [opened, setOpened] = useState(false);
  const [alias, setAlias] = useSetState<AliasProps>({} as AliasProps);
  const [displayAliases, setDisplayAliases] = useState<AliasProps[]>([]);

  useEffect(() => {
    setDisplayAliases(aliases);
  }, [aliases]);

  useEffect(() => {
    if (alias.alias_id) {
      const newDisplayAliases = [...displayAliases];
      const index = newDisplayAliases.findIndex((a) => a.alias_id === alias.alias_id);
      if (index !== -1) {
        newDisplayAliases[index] = alias;
      }
      setDisplayAliases(newDisplayAliases);
    }
  }, [alias]);

  return (
    <Box w="100%">
      <AliasModal
        alias={alias}
        setAlias={setAlias}
        opened={opened}
        onClose={() => setOpened(false)}
      />
      <AnimatedGrid
        items={displayAliases}
        getKey={aliasKey}
        cols={{ base: 1, "400px": 2 }}
        renderItem={(alias) => (
          <Alias
            alias={alias}
            onClick={() => {
              if (!alias.uploader)
                setAlias({
                  uploader: undefined,
                });
              setAlias(alias);
              setOpened(true);
            }}
            onVote={(vote) => {
              const previousAlias = alias;
              setAlias(calculateNewAliasWeight(alias, vote));
              onVote();
              return () => setAlias(previousAlias);
            }}
            onMutate={onMutate}
          />
        )}
      />
    </Box>
  );
};
