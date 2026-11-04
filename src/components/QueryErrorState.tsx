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
