import { TransformedValues, useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "@/utils/validator.ts";
import { useEffect } from "react";
import { listToPermission, permissionToList, UserPermission } from "@/utils/session.ts";
import { deleteUser, updateUser } from "@/utils/api/user.ts";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { Button, Group, Modal, MultiSelect, Space, TextInput } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { UserProps } from "@/types/user";

interface FormValues {
  name: string;
  email: string;
  permissions?: string[];
  permission: number;
}

export const EditUserModal = ({ user, opened, onClose }: { user: UserProps | null, opened: boolean, onClose(): void }) => {
  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      email: "",
      permissions: [],
      permission: user ? user.permission : UserPermission.User,
    },

    validate: {
      name: (value) => validateUserName(value, { allowEmpty: true }),
      email: (value) => validateEmail(value, { allowEmpty: true }),
      permissions: (value) => (value || []).length > 0 ? null : "请选择权限",
    },

    transformValues: (values) => ({
      name: values.name || user?.name || "",
      email: values.email || user?.email || "",
      permission: listToPermission((values.permissions || []).map((permission) => parseInt(permission))),
    }),
  });

  const updateUserHandler = async (values: TransformedValues<typeof form>) => {
    if (!user) return;

    try {
      const res = await updateUser(user.id, values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      user.name = values.name || user.name;
      user.email = values.email || user.email;
      user.permission = values.permission;

      form.resetField("name");
      form.resetField("email");
    } catch (err) {
      openRetryModal("保存失败", `${err}`, () => updateUserHandler(values));
    } finally {
      onClose();
    }
  }

  const deleteUserHandler = async () => {
    if (!user) return;

    try {
      const res = await deleteUser(user.id);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      user.deleted = true;
    } catch (err) {
      openRetryModal("删除失败", `${err}`, deleteUserHandler);
    } finally {
      onClose();
    }
  }

  useEffect(() => {
    if (!user) return;

    form.setFieldValue("permissions", permissionToList(user.permission).map((permission) => permission.toString()));
  }, [user]);

  return (
    <Modal opened={opened} onClose={onClose} title="编辑用户" centered>
      <form onSubmit={form.onSubmit(updateUserHandler)}>
        <TextInput label="用户名" placeholder={user?.name} mb="xs" {...form.getInputProps("name")} />
        <TextInput label="邮箱" placeholder={user?.email} mb="xs" {...form.getInputProps("email")} />
        <MultiSelect
          label="权限"
          data={[
            { label: "普通用户", value: UserPermission.User.toString() },
            { label: "开发者", value: UserPermission.Developer.toString() },
            { label: "管理员", value: UserPermission.Administrator.toString() },
          ]}
          comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
          {...form.getInputProps("permissions")}
        />
        <Space h="lg" />
        <Group justify="space-between">
          <Group>
            <Button
              variant="outline"
              color="red"
              leftSection={<IconTrash size={20} />}
              onClick={() => openConfirmModal("删除用户", "你确定要删除该用户吗？", deleteUserHandler, {
                confirmProps: { color: 'red' }
              })}
            >
              删除用户
            </Button>
          </Group>
          <Group>
            <Button variant="default" onClick={onClose}>取消</Button>
            <Button color="blue" type="submit">保存</Button>
          </Group>
        </Group>
      </form>
    </Modal>
  )
}