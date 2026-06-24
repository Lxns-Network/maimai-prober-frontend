import {
  Group,
  Text,
  Loader,
  Card,
  Switch,
  ActionIcon,
  Tooltip,
  CopyButton,
  Anchor,
  Divider,
  useMantineTheme,
  Button,
  TextInput,
  Stack,
  DataList,
  Alert,
} from "@mantine/core";
import { Icon } from "@/components/MdiIcon";
import { mdiEye, mdiEyeOff, mdiWebOff, mdiQqchat } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import { IconCheck, IconCopy, IconEdit, IconRefresh } from "@tabler/icons-react";
import classes from "../Page.module.css";
import { useComputedColorScheme } from "@mantine/core";
import { Page } from "@/components/Page/Page.tsx";
import { DeveloperOAuthSection } from "@/components/Developer/DeveloperOAuthSection.tsx";
import { EditDeveloperModal } from "@/components/Developer/EditDeveloperModal.tsx";
import { useDeveloper } from "@/hooks/queries/useDeveloper.ts";
import { DeveloperUsageSection } from "@/components/Developer/DeveloperUsageSection.tsx";
import { useResetDeveloperApiKey } from "@/hooks/mutations/useDeveloperMutations.ts";
import { useEffect } from "react";
import { navigate } from "vike/client/router";

const DeveloperInfoContent = () => {
  const { developer, isLoading, error, setData, invalidate } = useDeveloper();
  const { mutate: resetApiKey } = useResetDeveloperApiKey();
  const [visible, visibleHandler] = useDisclosure(false);
  const [editModalOpened, editModal] = useDisclosure(false);
  const computedColorScheme = useComputedColorScheme("light");
  const theme = useMantineTheme();

  const resetDeveloperApiKeyHandler = () => {
    resetApiKey(undefined, {
      onSuccess: (data) => {
        setData((prev) => (prev ? { ...prev, api_key: data.api_key } : prev));
      },
      onError: (err) => console.error(err),
    });
  };

  if (error) {
    return (
      <Alert
        radius="md"
        icon={<Icon path={mdiWebOff} />}
        title={`没有获取到开发者数据`}
        color="red"
        mb="md"
      >
        <Text size="sm">可能是网络连接已断开，请检查你的网络连接是否正常。</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {developer && (
        <EditDeveloperModal
          opened={editModalOpened}
          close={editModal.close}
          developer={developer}
          onSuccess={invalidate}
        />
      )}
      <Card withBorder radius="md" className={classes.card}>
        <Group justify="space-between" wrap="nowrap" gap="xl" align="center">
          <div>
            <Text fz="lg" fw={700}>
              我的申请信息
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              查看你的开发者申请信息
            </Text>
          </div>
          <Button
            variant="default"
            size="sm"
            leftSection={<IconEdit size={20} />}
            onClick={editModal.open}
          >
            编辑
          </Button>
        </Group>
        <Divider
          mt="md"
          mb="md"
          color={computedColorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[2]}
        />
        {isLoading && (
          <Group justify="center" m="xs">
            <Loader />
          </Group>
        )}
        {developer && (
          <DataList labelWidth={60}>
            <DataList.Item>
              <DataList.ItemLabel>开发者名称</DataList.ItemLabel>
              <DataList.ItemValue>{developer.name}</DataList.ItemValue>
            </DataList.Item>
            <DataList.Item>
              <DataList.ItemLabel>开发者地址</DataList.ItemLabel>
              <DataList.ItemValue>
                <Anchor href={developer.url} target="_blank" fz="sm">
                  {developer.url.replace(/(^\w+:|^)\/\//, "")}
                </Anchor>
              </DataList.ItemValue>
            </DataList.Item>
            <DataList.Item>
              <DataList.ItemLabel>申请时间</DataList.ItemLabel>
              <DataList.ItemValue>
                {new Date(developer.apply_time).toLocaleString()}
              </DataList.ItemValue>
            </DataList.Item>
            <DataList.Item>
              <DataList.ItemLabel>申请理由</DataList.ItemLabel>
              <DataList.ItemValue>{developer.reason}</DataList.ItemValue>
            </DataList.Item>
          </DataList>
        )}
      </Card>

      <Card withBorder radius="md" className={classes.card}>
        <Group justify="space-between" gap="md" align="center">
          <div>
            <Text fz="lg" fw={700}>
              开发者交流群
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              加入开发者交流群，与其他开发者交流，获取最新的 API 更新和使用支持
            </Text>
          </div>
          <Button
            size="sm"
            component="a"
            href="https://qm.qq.com/q/SfEFsTAAYm"
            target="_blank"
            rel="noreferrer"
            leftSection={<Icon path={mdiQqchat} size={0.8} />}
            style={{ flexShrink: 0 }}
          >
            加入 QQ 群
          </Button>
        </Group>
      </Card>

      <Card withBorder radius="md" className={classes.card}>
        <Group justify="space-between" wrap="nowrap" gap="xl" align="center" mb="md">
          <div>
            <Text fz="lg" fw={700}>
              开发者 API 密钥
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              用于访问 maimai DX 查分器开发者 API
            </Text>
          </div>
          <Switch
            size="lg"
            value={visible ? "visible" : "hidden"}
            onClick={visibleHandler.toggle}
            onLabel={<Icon path={mdiEye} size={0.8} />}
            offLabel={<Icon path={mdiEyeOff} size={0.8} />}
          />
        </Group>
        {isLoading && (
          <Group justify="center">
            <Loader />
          </Group>
        )}
        {developer && (
          <TextInput
            variant="filled"
            value={visible ? developer.api_key : developer.api_key.replace(/./g, "•")}
            rightSection={
              <CopyButton value={developer.api_key} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "已复制" : "复制"} withArrow position="right">
                    <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} onClick={copy}>
                      {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            }
            readOnly
          />
        )}
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            size="sm"
            leftSection={<IconRefresh size={20} />}
            onClick={resetDeveloperApiKeyHandler}
          >
            重置 API 密钥
          </Button>
        </Group>
      </Card>

      <DeveloperOAuthSection />
    </Stack>
  );
};

export default function DeveloperInfo() {
  const { developer, isLoading } = useDeveloper();

  useEffect(() => {
    if (isLoading) return;

    if (!developer || !developer.api_key) {
      navigate("/developer/apply", { overwriteLastHistoryEntry: true });
    }
  }, [isLoading, developer]);

  return (
    <Page
      meta={{
        title: "开发者面板",
        description: "查看你的 maimai DX 查分器开发者信息",
      }}
      tabs={[
        { id: "info", name: "基本信息", children: <DeveloperInfoContent /> },
        { id: "usage", name: "API 用量", children: <DeveloperUsageSection /> },
      ]}
    />
  );
}
