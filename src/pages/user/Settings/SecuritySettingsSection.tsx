import { Text, Card } from '@mantine/core';
import { SettingList } from '@/components/Settings/SettingList.tsx';
import { PasskeyManagement } from '@/components/Settings/PasskeyManagement.tsx';
import { EditPasswordModal } from "@/components/Settings/EditPasswordModal.tsx";
import { useDisclosure } from "@mantine/hooks";
import classes from "../../Page.module.css"
import { openConfirmModal, openRetryModal } from '@/utils/modal';
import { deleteSelfUser } from '@/utils/api/user';

export const SecuritySettingsSection = () => {
  const [editPasswordModalOpened, editPasswordModal] = useDisclosure(false);

  const deleteSelfUserHandler = async () => {
    try {
      const res = await deleteSelfUser();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      localStorage.removeItem("token");
      window.location.href = "/";
    } catch (error) {
      openRetryModal("删除失败", `${error}`, deleteSelfUserHandler);
    }
  }

  return (
    <div>
      <EditPasswordModal opened={editPasswordModalOpened} close={() => editPasswordModal.close()} />
      
      <PasskeyManagement />

      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          账号安全
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          修改密码或删除查分器账号
        </Text>
        <SettingList data={[{
          key: "reset_password",
          title: "修改密码",
          description: "修改你的查分器账号密码。",
          placeholder: "修改",
          optionType: "button",
          onClick: () => editPasswordModal.open(),
        }, {
          key: "delete_account",
          title: "删除账号",
          description: "删除你的查分器账号，但同步的游戏数据仍会被保留。",
          placeholder: "删除",
          color: "red",
          optionType: "button",
          onClick: () => openConfirmModal("删除账号", "你确定要删除你的查分器账号吗？该操作不可撤销，同步的游戏数据仍会被保留。", deleteSelfUserHandler, {
            confirmProps: { color: 'red' },
          }),
        }]} />
      </Card>
    </div>
  );
}
