import { ReactNode } from "react";
import { Button } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { EmptyState } from "./EmptyState.tsx";

interface QueryErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  iconSize?: number;
}

/** 加载失败时代替空状态展示，避免把请求失败误显示成「暂无数据」。 */
export function QueryErrorState({
  title = "加载失败",
  description,
  onRetry,
  iconSize = 64,
}: QueryErrorStateProps) {
  return (
    <EmptyState
      icon={<IconAlertCircle size={iconSize} stroke={1.5} />}
      title={title}
      description={description}
    >
      {onRetry && (
        <Button
          mt="md"
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          onClick={onRetry}
        >
          重试
        </Button>
      )}
    </EmptyState>
  );
}
