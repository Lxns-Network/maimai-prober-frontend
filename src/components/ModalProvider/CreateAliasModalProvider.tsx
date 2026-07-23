import useAliasStore from "@/hooks/useAliasStore.ts";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { Center, Loader, Modal } from "@mantine/core";
import { lazy, Suspense, useEffect, useState } from "react";

const CreateAliasModal = lazy(() =>
  import("../Alias/CreateAliasModal.tsx").then(({ CreateAliasModal }) => ({
    default: CreateAliasModal,
  })),
);

export function CreateAliasModalProvider() {
  const { opened, game, songId, closeModal } = useAliasStore();
  const [activated, setActivated] = useState(false);
  useBackDismiss(opened, () => closeModal());

  useEffect(() => {
    if (opened) setActivated(true);
  }, [opened]);

  if (!opened && !activated) return null;

  return (
    <Suspense
      fallback={
        <Modal opened={opened} onClose={() => closeModal()} title="创建曲目别名" centered>
          <Center py="xl">
            <Loader />
          </Center>
        </Modal>
      }
    >
      <CreateAliasModal
        game={game}
        defaultSongId={songId ?? undefined}
        opened={opened}
        onClose={closeModal}
      />
    </Suspense>
  );
}
