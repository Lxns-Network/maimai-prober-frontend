import { MaimaiCreateScoreContent } from "../Scores/maimai/CreateScoreModal.tsx";
import { ChunithmCreateScoreModalContent } from "../Scores/chunithm/CreateScoreModal.tsx";
import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Modal } from "@mantine/core";

export function CreateScoreModalProvider() {
  const { opened, game, score, closeModal } = useCreateScoreStore();

  return (
    <Modal.Root
      opened={opened}
      onClose={closeModal}
      onExitTransitionEnd={() => {
        useCreateScoreStore.setState({
          score: null,
        });
      }}
      centered
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>创建成绩</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          {game === "maimai" && (
            <MaimaiCreateScoreContent
              score={score as MaimaiScoreProps}
              onSubmit={(values) => closeModal(values)}
              onClose={closeModal}
            />
          )}
          {game === "chunithm" && (
            <ChunithmCreateScoreModalContent
              score={score as ChunithmScoreProps}
              onSubmit={(values) => closeModal(values)}
              onClose={closeModal}
            />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}