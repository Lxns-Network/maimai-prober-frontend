import { CreateAliasModal } from "../Alias/CreateAliasModal.tsx";
import useAliasStore from "@/hooks/useAliasStore.ts";

export function CreateAliasModalProvider() {
  const { opened, game, songId, closeModal } = useAliasStore();

  return (
    <CreateAliasModal
      game={game}
      defaultSongId={songId ?? undefined}
      opened={opened}
      onClose={closeModal}
    />
  );
}