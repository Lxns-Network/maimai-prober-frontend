import { IconEdit } from "@tabler/icons-react";
import { useHover } from "@mantine/hooks";
import React from "react";
import { LoadingOverlay, MantineRadius, UnstyledButton } from "@mantine/core";

interface EditAvatarButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  radius?: MantineRadius | number;
}

export const EditAvatarButton = ({
  children,
  onClick,
  disabled,
  radius = 6,
}: EditAvatarButtonProps) => {
  const { hovered, ref } = useHover();

  return (
    <UnstyledButton
      pos="relative"
      ref={ref}
      onClick={() => !disabled && onClick()}
      style={{ cursor: "pointer" }}
    >
      <LoadingOverlay
        visible={hovered && !disabled}
        zIndex={1}
        loaderProps={{
          children: <IconEdit />,
        }}
        overlayProps={{ radius }}
        styles={{
          overlay: { borderRadius: radius },
          loader: { height: 24 },
        }}
      />
      {children}
    </UnstyledButton>
  );
};
