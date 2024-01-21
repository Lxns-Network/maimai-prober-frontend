import { modals } from "@mantine/modals";
import { Text } from "@mantine/core";
import { ReactNode } from "react";

export const openAlertModal = (title: string, content: string | ReactNode, { ...props }: any = {}) => {
  modals.openConfirmModal({
    title,
    centered: true,
    withCloseButton: false,
    children: (
      <Text size="sm">
        {content}
      </Text>
    ),
    labels: { confirm: '确定', cancel: '取消' },
    onConfirm: () => modals.closeAll(),
    ...props,
  });
}

export const openConfirmModal = (title: string, content: string | ReactNode, onConfirm: () => void, { ...props }: any = {}) => {
  modals.openConfirmModal({
    title,
    centered: true,
    withCloseButton: false,
    children: (
      <Text size="sm">
        {content}
      </Text>
    ),
    labels: { confirm: '确定', cancel: '取消' },
    onCancel: () => modals.closeAll(),
    onConfirm: onConfirm,
    ...props,
  });
}

export const openRetryModal = (title: string, content: string | ReactNode, onConfirm: () => void, { ...props }: any = {}) => {
  modals.openConfirmModal({
    title,
    centered: true,
    withCloseButton: false,
    children: (
      <Text size="sm">
        {content}
      </Text>
    ),
    labels: { confirm: '重试', cancel: '取消' },
    onCancel: () => modals.closeAll(),
    onConfirm: onConfirm,
    ...props,
  });
}