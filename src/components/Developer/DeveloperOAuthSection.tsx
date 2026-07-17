import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  CopyButton,
  Divider,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEdit,
  IconLink,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { OAuthAppProps } from "@/types/developer";
import { useOAuthApps } from "@/hooks/queries/useOAuthApps.ts";
import { useDeleteOAuthApp } from "@/hooks/mutations/useDeveloperMutations.ts";
import { useDisclosure } from "@mantine/hooks";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { CreateOAuthClientModal } from "@/components/Developer/CreateOAuthClientModal.tsx";
import pageClasses from "@/pages/Page.module.css";
import classes from "./DeveloperOAuthSection.module.css";

const MAX_APPS = 5;

const TextInputWithCopyButton = ({ label, value }: { label: string; value: string }) => (
  <TextInput
    label={label}
    value={value}
    variant="filled"
    readOnly
    rightSection={
      <CopyButton value={value} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "已复制" : "复制"} withArrow position="left">
            <ActionIcon
              variant="subtle"
              color={copied ? "teal" : "gray"}
              aria-label={copied ? `${label}已复制` : `复制${label}`}
              onClick={copy}
            >
              {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    }
  />
);

const OAuthAppCard = ({
  app,
  authLink,
  onEdit,
  onDelete,
}: {
  app: OAuthAppProps;
  authLink: string;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={classes.appCard} withBorder radius="md" p={0}>
      <Group align="center" gap="md" wrap="nowrap" m="xs">
        <Avatar
          src={app.logo_url}
          alt={`${app.name} 的应用图标`}
          imageProps={{ loading: "lazy" }}
          radius="sm"
        >
          {app.name.charAt(0).toUpperCase()}
        </Avatar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} size="md" truncate>
            {app.name}
          </Text>
          <Group gap="md" mt={2} wrap="nowrap">
            <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
              <IconLink size={12} style={{ color: "var(--mantine-color-dimmed)", flexShrink: 0 }} />
              <Text size="xs" c="dimmed" truncate>
                {app.redirect_uri}
              </Text>
            </Group>
            {app.create_time && (
              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                <IconCalendar size={12} style={{ color: "var(--mantine-color-dimmed)" }} />
                <Text size="xs" c="dimmed">
                  创建于 {new Date(app.create_time).toLocaleDateString()}
                </Text>
              </Group>
            )}
          </Group>
        </div>

        <Group gap={2} wrap="nowrap">
          <Tooltip label="编辑" position="top" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label={`编辑 OAuth 应用：${app.name}`}
              onClick={onEdit}
            >
              <IconEdit size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="删除" position="top" withArrow>
            <ActionIcon
              variant="subtle"
              color="red"
              size="lg"
              aria-label={`删除 OAuth 应用：${app.name}`}
              onClick={onDelete}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Divider />

      <Box m="xs">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            应用凭据
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={expanded ? "收起应用凭据" : "展开应用凭据"}
            aria-expanded={expanded}
            aria-controls={`oauth-credentials-${app.client_id}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
        </Group>
        <Collapse id={`oauth-credentials-${app.client_id}`} expanded={expanded}>
          <Grid mt="xs">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInputWithCopyButton label="应用 ID" value={app.client_id || ""} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInputWithCopyButton label="应用密钥" value={app.client_secret || ""} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInputWithCopyButton label="OAuth 授权链接" value={authLink} />
            </Grid.Col>
          </Grid>
        </Collapse>
      </Box>
    </Card>
  );
};

export const DeveloperOAuthSection = () => {
  const { apps, isLoading, invalidate } = useOAuthApps();
  const deleteOAuthAppMutation = useDeleteOAuthApp();

  const [opened, modal] = useDisclosure(false);
  const [selectedApp, setSelectedApp] = useState<OAuthAppProps | null>(null);

  const generateOAuthAppLink = (app: OAuthAppProps) => {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: app.client_id || "",
      redirect_uri: app.redirect_uri,
      scope: Array.isArray(app.scope) ? app.scope.join(" ") : app.scope,
    });
    return `${window.location.origin}/oauth/authorize?${params.toString()}`;
  };

  const openCreate = () => {
    setSelectedApp(null);
    modal.open();
  };

  const deleteAppHandler = async (clientId: string) => {
    try {
      await deleteOAuthAppMutation.mutateAsync(clientId);
      await invalidate();
    } catch (error) {
      openRetryModal("删除失败", `${error}`, () => deleteAppHandler(clientId));
    }
  };

  useEffect(() => {
    if (!opened) invalidate();
  }, [opened]);

  const atLimit = apps.length >= MAX_APPS;

  return (
    <Card withBorder radius="md" className={pageClasses.card}>
      <CreateOAuthClientModal app={selectedApp} opened={opened} onClose={modal.close} />
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap" align="center" gap="md">
          <Box>
            <Group gap="sm">
              <Text fz="lg" fw={700}>
                OAuth 应用
              </Text>
              <Badge variant="light">测试版</Badge>
            </Group>
            <Text fz="xs" c="dimmed" mt={3}>
              使用 OAuth 应用获取用户授权访问其 maimai DX 查分器数据
            </Text>
          </Box>
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={openCreate}
            disabled={atLimit}
            style={{ flexShrink: 0 }}
          >
            创建应用
          </Button>
        </Group>

        {isLoading ? (
          <Group justify="center" m="md">
            <Loader />
          </Group>
        ) : apps.length > 0 ? (
          <Stack gap="md">
            {apps.map((app) => (
              <OAuthAppCard
                key={app.client_id || app.name}
                app={app}
                authLink={generateOAuthAppLink(app)}
                onEdit={() => {
                  setSelectedApp(app);
                  modal.open();
                }}
                onDelete={() =>
                  openConfirmModal("删除应用", "你确定要删除此应用吗？", () =>
                    deleteAppHandler(app.client_id || ""),
                  )
                }
              />
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            你还没有创建任何 OAuth 应用
          </Text>
        )}
      </Stack>
    </Card>
  );
};
