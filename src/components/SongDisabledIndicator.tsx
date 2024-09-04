import React from "react";
import { Flex, Indicator } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";

export const SongDisabledIndicator = ({ disabled, children }: { disabled?: boolean, children: React.ReactElement }) => {
  return <Indicator
    color="red"
    position="bottom-center"
    label={<Flex align="center" gap={2}><IconTrash size={14} />被移除</Flex>}
    size={18}
    offset={12}
    zIndex={2}
    disabled={!disabled}
  >
    {children}
  </Indicator>
}