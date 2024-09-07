import React from "react";
import { Box, Flex, Indicator } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";

export const SongDisabledIndicator = ({ disabled, children }: { disabled?: boolean, children: React.ReactElement }) => {
  if (!disabled) {
    return children;
  }
  return <Indicator
    color="none"
    position="bottom-center"
    label={<Flex align="center" gap={2}><IconTrash size={14} />被移除</Flex>}
    size={18}
    offset={12}
    zIndex={2}
    disabled={!disabled}
  >
    <Box w="100%" h="100%" style={{
      position: "absolute",
      zIndex: 1,
      borderRadius: "var(--mantine-radius-md)",
      boxShadow: "inset 0 -80px 30px -50px var(--mantine-color-red-7)",
      pointerEvents: "none",
    }} />
    {children}
  </Indicator>
}