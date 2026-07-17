import { Box } from "@mantine/core";
import { Alias } from "./Alias.tsx";
import { useSetState } from "@mantine/hooks";
import { AliasModal, calculateNewAliasWeight } from "./AliasModal.tsx";
import { useEffect, useState } from "react";
import { AnimatedGrid } from "@/components/AnimatedGrid.tsx";
import { AliasProps } from "@/types/alias";

interface AliasListProps {
  aliases: AliasProps[];
  onMutate: () => void;
}

const aliasKey = (alias: AliasProps) => `${alias.song.id}:${alias.alias_id}`;

export const AliasList = ({ aliases, onMutate }: AliasListProps) => {
  const [opened, setOpened] = useState(false);
  const [alias, setAlias] = useSetState<AliasProps>({} as AliasProps);
  const [displayAliases, setDisplayAliases] = useState<AliasProps[]>([]);

  useEffect(() => {
    setDisplayAliases(aliases);
  }, [aliases]);

  useEffect(() => {
    if (alias.alias_id) {
      setDisplayAliases((currentAliases) => {
        const index = currentAliases.findIndex((item) => item.alias_id === alias.alias_id);
        if (index === -1) return currentAliases;

        const nextAliases = [...currentAliases];
        nextAliases[index] = alias;
        return nextAliases;
      });
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
              return () => setAlias(previousAlias);
            }}
            onMutate={onMutate}
          />
        )}
      />
    </Box>
  );
};
