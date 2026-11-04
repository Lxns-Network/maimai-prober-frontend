import { useState } from "react";
import { Box, Button, Card, Group, Text, TextInput } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useFileDialog } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { UserAvatar } from "@/components/Friends/UserAvatar";
import { EditAvatarButton } from "@/components/EditAvatarButton";
import { useUser } from "@/hooks/queries/useUser";
import {
  useDeleteUserAvatar,
  useUpdateUserProfile,
  useUploadUserAvatar,
} from "@/hooks/mutations/useUserMutations";
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal";
import { getFriendErrorMessage } from "@/utils/api/friend";
import { validateUserName } from "@/utils/validator";
import classes from "./Profile.module.css";

export const ProfileEditCard = () => {
  const { user, setData: setUser, invalidate } = useUser();
  const queryClient = useQueryClient();
  const uploadAvatar = useUploadUserAvatar();
  const deleteAvatar = useDeleteUserAvatar();
  const updateProfile = useUpdateUserProfile();
  const [editingName, setEditingName] = useState(false);

  const nameForm = useForm({
    initialValues: { name: "" },
    validate: {
      name: (value) => validateUserName(value, { allowEmpty: false }),
    },
  });

  const invalidateComments = () =>
    void queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        /^user\/(maimai|chunithm)\/comment\/list\?/.test(query.queryKey[0]),
    });

  const avatarDialog = useFileDialog({
    multiple: false,
    accept: "image/jpeg,image/png,image/webp",
    onChange: (files) => {
      const file = files?.[0];
      if (!file || !user) return;
      uploadAvatar.mutate(file, {
        onSuccess: (data) => {
          setUser((prev) => prev && { ...prev, avatar_url: data.avatar_url });
          invalidateComments();
        },
        onError: (error) => openAlertModal("头像上传失败", getFriendErrorMessage(error)),
      });
    },
  });

  const clearAvatar = () => {
    if (!user?.avatar_url) return;
    openConfirmModal("删除头像", "确定要删除自定义头像并恢复默认头像吗？", () =>
      deleteAvatar.mutate(undefined, {
        onSuccess: () => {
          setUser((prev) => prev && { ...prev, avatar_url: undefined });
          invalidateComments();
        },
        onError: (error) => openAlertModal("删除头像失败", getFriendErrorMessage(error)),
      }),
    );
  };

  const startEditingName = () => {
    const name = user?.name ?? "";
    nameForm.setInitialValues({ name });
    nameForm.setValues({ name });
    setEditingName(true);
  };

  const saveName = ({ name }: { name: string }) => {
    updateProfile.mutate(
      { name },
      {
        onSuccess: () => {
          setUser((prev) => prev && { ...prev, name });
          setEditingName(false);
          invalidateComments();
          void invalidate();
          notifications.show({ title: "修改成功", message: "你的用户名已更新。", color: "green" });
        },
        onError: (error) => openRetryModal("修改失败", `${error}`, () => saveName({ name })),
      },
    );
  };

  return (
    <Card className={classes.card} withBorder radius="md">
      <Box mb="md">
        <Text fz="lg" fw={700}>
          个人资料
        </Text>
        <Text fz="xs" c="dimmed" mt={3}>
          查看你的查分器账号的详情
        </Text>
      </Box>
      <Group gap="md" wrap="nowrap">
        <EditAvatarButton onClick={avatarDialog.open} disabled={!user || uploadAvatar.isPending}>
          <UserAvatar
            username={user?.name ?? "用户"}
            avatarUrl={user?.avatar_url}
            size={72}
            radius="md"
          />
        </EditAvatarButton>
        <Box miw={0} flex={1}>
          <Text fw={600} truncate>
            {user?.name}
          </Text>
          <Group gap="xs" mt="xs">
            {!editingName && (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconPencil size={14} />}
                disabled={!user}
                onClick={startEditingName}
              >
                修改用户名
              </Button>
            )}
            {user?.avatar_url && (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                loading={deleteAvatar.isPending}
                onClick={clearAvatar}
              >
                删除头像
              </Button>
            )}
          </Group>
        </Box>
      </Group>
      {editingName && (
        <form onSubmit={nameForm.onSubmit(saveName)}>
          <Group mt="md" gap="xs" align="flex-start">
            <TextInput
              flex="1 1 220px"
              variant="filled"
              aria-label="用户名"
              placeholder="4 到 16 个字母、数字或下划线"
              description="修改后，已分享的好友链接将失效"
              data-autofocus
              autoFocus
              {...nameForm.getInputProps("name")}
            />
            <Group gap="xs" wrap="nowrap" ml="auto">
              <Button variant="default" onClick={() => setEditingName(false)}>
                取消
              </Button>
              <Button
                type="submit"
                loading={updateProfile.isPending}
                disabled={!nameForm.isDirty()}
              >
                保存
              </Button>
            </Group>
          </Group>
        </form>
      )}
    </Card>
  );
};
