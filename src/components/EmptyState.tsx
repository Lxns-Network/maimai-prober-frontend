import { ReactNode } from "react";
import { Flex, Text } from "@mantine/core";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

// 空状态：居中的暗色图标 + 文案（沿用项目此前的内联样式）。icon 由调用方按需指定尺寸。
export function EmptyState({ icon, title, description, children }: EmptyStateProps) {
  return (
    <Flex gap="xs" align="center" direction="column" c="dimmed" py="xl">
      {icon}
      {title != null && (
        <Text fz="sm" ta="center">
          {title}
        </Text>
      )}
      {description != null && (
        <Text fz="xs" ta="center">
          {description}
        </Text>
      )}
      {children}
    </Flex>
  );
}
