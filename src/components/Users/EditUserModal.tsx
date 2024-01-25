import { useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "../../utils/validator.tsx";
import { useEffect, useState } from "react";
import { listToPermission, permissionToList, UserPermission } from "../../utils/session.tsx";
import { deleteUser, updateUser } from "../../utils/api/user.tsx";
import { openConfirmModal, openRetryModal } from "../../utils/modal.tsx";
import { Button, Group, Modal, MultiSelect, TextInput } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { UserProps } from "../../pages/admin/Users.tsx";

export const EditUserModal = ({ user, opened, close }: { user: UserProps | null, opened: boolean, close(): void }) => {
  const form = useForm({
    initialValues: {
      name: '',
      email: '',
    },

    validate: {
      name: (value) => (value == "" || validateUserName(value) ? null : "用户名格式不正确"),
      email: (value) => (value == "" || validateEmail(value) ? null : "邮箱格式不正确"),
    },
  });
  const [permission, setPermission] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    setPermission(permissionToList(user.permission).map((permission) => permission.toString()));
  }, [user]);

  const updateUserHandler = async (values: any) => {
    if (!user) return;

    if (!values.name) values.name = user.name;
    if (!values.email) values.email = user.email;

    values.id = user.id;
    values.permission = listToPermission(permission.map((permission) => parseInt(permission)));

    try {
      const res = await updateUser(values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      user.name = values.name;
      user.email = values.email;
      user.permission = values.permission;
    } catch (err) {
      openRetryModal("保存失败", `${err}`, () => updateUserHandler(values));
    } finally {
      form.reset();
      close();
    }
  }

  const deleteUserHandler = async () => {
    if (!user) return;

    try {
      const res = await deleteUser({ id: user.id });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      user.deleted = true;
    } catch (err) {
      openRetryModal("删除失败", `${err}`, deleteUserHandler);
    } finally {
      form.reset();
      close();
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="编辑用户" centered>
      <form onSubmit={form.onSubmit((values) => updateUserHandler(values))}>
        <TextInput label="用户名" placeholder={user?.name} mb="xs" {...form.getInputProps("name")} />
        <TextInput label="邮箱" placeholder={user?.email} mb="xs" {...form.getInputProps("email")} />
        <MultiSelect data={[
          { label: "普通用户", value: UserPermission.User.toString() },
          { label: "开发者", value: UserPermission.Developer.toString() },
          { label: "管理员", value: UserPermission.Administrator.toString() },
        ]} label="权限" mb="xs" defaultValue={permission} onChange={setPermission} />
        <Group justify="space-between" mt="lg">
          <Group>
            <Button
              variant="outline"
              color="red"
              leftSection={<IconTrash size={20} />}
              onClick={() => {
                openConfirmModal("删除用户", "你确定要删除该用户吗？", deleteUserHandler, {
                  confirmProps: { color: 'red' }
                });
              }}
            >
              删除用户
            </Button>
          </Group>
          <Group>
            <Button variant="default" onClick={close}>取消</Button>
            <Button color="blue" type="submit">保存</Button>
          </Group>
        </Group>
      </form>
    </Modal>
  )
}