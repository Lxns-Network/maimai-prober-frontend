import { modals } from "@mantine/modals";
import { Text, TextInput } from "@mantine/core";
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

export const openFormModal = (
  title: string,
  description: string | ReactNode,
  inputProps: {
    label: string;
    placeholder?: string;
    defaultValue?: string;
    required?: boolean;
  },
  onSubmit: (value: string) => void,
  { ...props }: any = {}
) => {
  let inputValue = inputProps.defaultValue || '';

  modals.openConfirmModal({
    title,
    centered: true,
    children: (
      <>
        {description && (
          <Text size="sm" c="dimmed" mb="md">
            {description}
          </Text>
        )}
        <TextInput
          label={inputProps.label}
          placeholder={inputProps.placeholder}
          defaultValue={inputProps.defaultValue}
          required={inputProps.required}
          data-autofocus
          onChange={(event) => {
            inputValue = event.currentTarget.value;
          }}
        />
      </>
    ),
    labels: { confirm: '确定', cancel: '取消' },
    onCancel: () => modals.closeAll(),
    onConfirm: () => {
      if (inputProps.required && !inputValue.trim()) {
        return;
      }
      onSubmit(inputValue);
    },
    ...props,
  });
}