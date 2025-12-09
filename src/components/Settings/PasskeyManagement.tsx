import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Text,
  Button,
  Group,
  Stack,
  Badge,
  ActionIcon,
  LoadingOverlay,
  Box,
  Flex,
  Image,
  useComputedColorScheme,
} from "@mantine/core";
import { IconKey, IconTrash, IconEdit, IconFingerprint } from "@tabler/icons-react";
import { getPasskeys, registerPasskey, updatePasskeyName, deletePasskey, getPasskeyRegisterChallenge } from "@/utils/api/user";
import { openAlertModal, openConfirmModal, openRetryModal, openFormModal } from "@/utils/modal";
import type { PasskeyProps, PasskeyRegisterData } from "@/types/user";
import classes from "./Settings.module.css";
import { startRegistration } from '@simplewebauthn/browser';
import aaguidData from "@/data/aaguid.json";

export const PasskeyManagement = () => {
  const [passkeys, setPasskeys] = useState<PasskeyProps[]>([]);
  const [loading, setLoading] = useState(true);
  const computedColorScheme = useComputedColorScheme();

  const getPasskeyInfo = (aaguid: string) => {
    const info = aaguidData[aaguid as keyof typeof aaguidData];
    if (!info || !('icon_dark' in info) || !('icon_light' in info)) {
      return { name: "未知设备", icon: null };
    }
    const icon = computedColorScheme === "dark" ? info.icon_dark : info.icon_light;
    return { name: info.name, icon };
  };

  const loadPasskeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPasskeys();
      const data = await res.json();
      if (!data.success) {
        openRetryModal("加载失败", data.message, loadPasskeys);
        return;
      }
      setPasskeys(data.data || []);
    } catch (error) {
      openRetryModal("加载失败", `${error}`, loadPasskeys);
      return;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  const handleRegisterPasskey = async (name?: string) => {
    try {
      if (!window.PublicKeyCredential) {
        openAlertModal("注册失败", "你的浏览器不支持通行密钥，请使用现代浏览器。");
        return;
      }

      const challengeRes = await getPasskeyRegisterChallenge();
      const challengeData = await challengeRes.json();
      if (!challengeData.success) {
        throw new Error(challengeData.message);
      }

      const registrationResult = await startRegistration({
        optionsJSON: challengeData.data.publicKey,
      });

      if (!registrationResult) {
        openRetryModal("注册失败", "通行密钥注册未完成。", () => handleRegisterPasskey(name));
        return;
      }

      const registerData: PasskeyRegisterData = {
        name: name || undefined,
        credential: registrationResult,
      };

      const res = await registerPasskey(registerData);
      const data = await res.json();
      if (!data.success) {
        openRetryModal("注册失败", data.message, () => handleRegisterPasskey(name));
        return;
      }

      openAlertModal("注册成功", "通行密钥已成功添加到你的账号。");
      await loadPasskeys();
    } catch (error) {
      if ((error as Error).name === "NotAllowedError") {
        return;
      }
      openRetryModal("注册失败", `${error}`, () => handleRegisterPasskey(name));
    }
  };

  const showRegisterModal = () => {
    openFormModal(
      "添加通行密钥",
      "请为你的新通行密钥命名，方便你识别它来自哪台设备。", 
      {
        label: "名称",
        placeholder: "例如：糯米好粘的笔记本电脑",
        required: false,
      },
      (name) => {
        handleRegisterPasskey(name.trim() || undefined);
      }
    );
  };

  const handleUpdateName = async (id: number, name: string) => {
    try {
      const res = await updatePasskeyName(id, { name });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      await loadPasskeys();
    } catch (error) {
      openRetryModal("修改失败", `${error}`, () => handleUpdateName(id, name));
    }
  };

  const showEditModal = (passkey: PasskeyProps) => {
    openFormModal(
      "编辑通行密钥",
      "修改通行密钥的名称，方便你识别它来自哪台设备。",
      {
        label: "名称",
        placeholder: "例如：糯米好粘的笔记本电脑",
        required: false,
        defaultValue: passkey.name || "",
      },
      (name) => {
        handleUpdateName(passkey.id, name.trim() || "");
      }
    );
  };

  const handleDeletePasskey = async (id: number) => {
    try {
      const res = await deletePasskey(id);
      const data = await res.json();
      if (!data.success) {
        openRetryModal("删除失败", data.message, () => handleDeletePasskey(id));
        return;
      }
      await loadPasskeys();
    } catch (error) {
      openRetryModal("删除失败", `${error}`, () => handleDeletePasskey(id));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Group justify="space-between" mb="md">
          <Box>
            <Text fz="lg" fw={700}>
              通行密钥管理
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              使用通行密钥快速安全地登录你的账号
            </Text>
          </Box>
          <Button
            leftSection={<IconKey size={16} />}
            onClick={showRegisterModal}
            size="sm"
          >
            添加通行密钥
          </Button>
        </Group>

        {passkeys.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            你还没有添加任何通行密钥
          </Text>
        ) : (
          <Stack gap="sm">
            {passkeys.map((passkey) => (
              <Card key={passkey.id} withBorder padding="sm">
                <Flex justify="space-between" align="center" wrap="wrap" gap="xs">
                  <Box style={{ flex: 1, minWidth: 200 }}>
                    <Group gap="xs">
                      {(() => {
                        const { icon } = getPasskeyInfo(passkey.aaguid);
                        return icon ? (
                          <Image src={icon} alt="" w={18} h={18} />
                        ) : (
                          <IconFingerprint size={18} />
                        );
                      })()}
                      <Text size="sm" fw={500}>
                        {passkey.name || "未命名的通行密钥"}
                      </Text>
                      {passkey.backup_eligible && (
                        <Badge size="sm" variant="light" color="blue">
                          可同步
                        </Badge>
                      )}
                    </Group>
                    <Stack gap={2} mt="xs">
                      <Flex align="center" columnGap="md" wrap="wrap">
                        <Text fz="xs" c="dimmed" w={60}>设备类型</Text>
                        <Text fz="xs">{getPasskeyInfo(passkey.aaguid).name}</Text>
                      </Flex>
                      <Flex align="center" columnGap="md" wrap="wrap">
                        <Text fz="xs" c="dimmed" w={60}>创建于</Text>
                        <Text fz="xs">{formatDate(passkey.create_time)}</Text>
                      </Flex>
                      {passkey.last_used_time && (
                        <Flex align="center" columnGap="md" wrap="wrap">
                          <Text fz="xs" c="dimmed" w={60}>最后使用于</Text>
                          <Text fz="xs">{formatDate(passkey.last_used_time)}</Text>
                        </Flex>
                      )}
                    </Stack>
                  </Box>
                  <Group gap="xs">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => showEditModal(passkey)}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="red"
                      onClick={() =>
                        openConfirmModal(
                          "删除通行密钥",
                          `你确定要删除「${passkey.name || "未命名的通行密钥"}」吗？`,
                          () => handleDeletePasskey(passkey.id),
                          { confirmProps: { color: "red" } }
                        )
                      }
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Flex>
              </Card>
            ))}
          </Stack>
        )}
      </Card>
    </>
  );
};
