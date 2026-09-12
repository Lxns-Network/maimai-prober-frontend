import { ActionIcon, Button } from "@mantine/core";
import { IconUserPlus } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import useFriendStore from "@/hooks/useFriendStore";

export const AddFriendButton = () => {
  const small = useMediaQuery("(max-width: 30rem)");
  const openAdd = useFriendStore((state) => state.openAdd);

  return small ? (
    <ActionIcon size="input-sm" variant="filled" aria-label="添加好友" onClick={openAdd}>
      <IconUserPlus size={20} />
    </ActionIcon>
  ) : (
    <Button leftSection={<IconUserPlus size={20} />} onClick={openAdd}>
      添加好友
    </Button>
  );
};
