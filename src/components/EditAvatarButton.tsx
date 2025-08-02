import { IconEdit } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import React from "react";
import { LoadingOverlay, UnstyledButton } from "@mantine/core";

interface EditAvatarButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export const EditAvatarButton = ({ children, onClick, disabled }: EditAvatarButtonProps) => {
  const { hovered, ref } = useHover();

  return (
    <UnstyledButton pos="relative" ref={ref} onClick={() => !disabled && onClick()} style={{ cursor: "pointer" }}>
      <LoadingOverlay
        visible={hovered && !disabled}
        loaderProps={{
          children: <IconEdit />
        }}
        overlayProps={{ radius: "sm" }}
        styles={{
          overlay: { borderRadius: 6 },
          loader: { height: 24 },
        }}
      />
      {children}
    </UnstyledButton>
  )
}