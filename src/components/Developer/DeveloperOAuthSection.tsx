import {
  ActionIcon, Badge, Box, Button, Card, CopyButton, Divider, Grid, Group, Stack, Text, TextInput, Tooltip
} from "@mantine/core";
import { IconCheck, IconCopy, IconEdit, IconTrash } from "@tabler/icons-react";
import { useOAuthApps } from "@/hooks/swr/useOAuthApps.ts";
import { useDisclosure, useViewportSize } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { OAuthAppProps } from "@/types/developer";
import { deleteOAuthApp } from "@/utils/api/developer.ts";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import classes from "@/pages/Page.module.css";
import { CreateOAuthClientModal } from "@/components/Developer/CreateOAuthClientModal.tsx";
import { DataTable } from "mantine-datatable";

const TextInputWithCopyButton = ({ label, value }: { label: string, value: string }) => {
  return (
    <TextInput
      label={label}
      value={value}
      rightSection={
        <CopyButton value={value} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已复制' : '复制'} withArrow position="right">
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      }
      readOnly
    />
  )
}

export const DeveloperOAuthSection = () => {
  const { apps, isLoading, mutate } = useOAuthApps();
  const { width } = useViewportSize();

  const [opened, modal] = useDisclosure(false);
  const [selectedApp, setSelectedApp] = useState<OAuthAppProps | null>(null);

  const generateOAuthAppLink = (app: OAuthAppProps) => {
    const baseUrl = `${window.location.origin}/oauth/authorize`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: app.client_id || "",
      redirect_uri: app.redirect_uri,
      scope: Array.isArray(app.scope) ? app.scope.join(' ') : app.scope,
    });

    return `${baseUrl}?${params.toString()}`;
  }

  const deleteAppHandler = async (clientId: string) => {
    try {
      const res = await deleteOAuthApp(clientId);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      await mutate();
    } catch (error) {
      openRetryModal("删除失败", `${error}`, () => deleteAppHandler(clientId));
    }
  }

  useEffect(() => {
    if (!opened) mutate();
  }, [opened]);

  return (
    <Card className={classes.card} withBorder radius="md" w={width > 700 ? `100%` : width - 32} p={0}>
      <CreateOAuthClientModal
        app={selectedApp}
        opened={opened}
        onClose={modal.close}
      />
      <Card.Section className={classes.section} m={0}>
        <Group justify="space-between" wrap="nowrap" gap="xl" align="center">
          <div>
            <Group gap="sm">
              <Text fz="lg" fw={700}>
                OAuth 应用
              </Text>
              <Badge variant="light" color="blue">测试版</Badge>
            </Group>
            <Text fz="xs" c="dimmed" mt={3}>
              使用 OAuth 应用来获取用户授权访问其 maimai DX 查分器数据
            </Text>
          </div>
        </Group>
      </Card.Section>
      <DataTable
        highlightOnHover
        striped
        verticalSpacing="xs"
        mih={apps.length === 0 ? 150 : 0}
        noHeader={apps.length === 0}
        emptyState={
          (apps.length === 0 && (
            <Stack align="center" gap="xs">
              <Text c="dimmed" size="sm">
                你还没有创建任何 OAuth 应用
              </Text>
              <Button
                style={{ pointerEvents: 'all' }}
                onClick={() => {
                  setSelectedApp(null);
                  modal.open();
                }}
              >
                创建 OAuth 应用
              </Button>
            </Stack>
          ))
        }
        // 数据
        columns={[
          {
            accessor: 'name',
            title: <Box ml={6}>应用名称</Box>,
            width: 100,
            ellipsis: true,
            render: ({ name }) => <Box ml={6}>{name}</Box>,
          },
          {
            accessor: 'redirect_uri',
            title: '回调 URI',
            width: 200,
            ellipsis: true,
          },
          {
            accessor: 'create_time',
            title: '创建时间',
            width: 150,
            render: ({ create_time }) => new Date(create_time || "").toLocaleString(),
          },
          {
            accessor: 'actions',
            title: <Box mr={6}>操作</Box>,
            width: 100,
            textAlign: 'right',
            render: (app) => (
              <Group gap={4} justify="right" wrap="nowrap">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedApp(app);
                    modal.open();
                  }}
                >
                  <IconEdit size={16} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={(event) => {
                    event.stopPropagation();
                    openConfirmModal("删除应用", "你确定要删除此应用吗？", () => deleteAppHandler(app.client_id || ""));
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
        records={apps}
        idAccessor="client_id"
        // 展开
        rowExpansion={{
          content: ({ record }) => (
            <Box p="md">
              <Grid>
                <Grid.Col span={6}>
                  <TextInputWithCopyButton label="应用 ID" value={record.client_id || ""} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <TextInputWithCopyButton label="应用密钥" value={record.client_secret || ""} />
                </Grid.Col>
                <Grid.Col span={12}>
                  <TextInputWithCopyButton label="OAuth 授权链接" value={generateOAuthAppLink(record)} />
                </Grid.Col>
              </Grid>
            </Box>
          ),
        }}
        // 其它
        fetching={isLoading}
      />
      {apps.length !== 0 && apps.length < 5 && (
        <Box>
          <Divider />
          <Stack align="center" gap="xs" p="md">
            <Button onClick={() => {
              setSelectedApp(null);
              modal.open();
            }}>
              创建 OAuth 应用
            </Button>
          </Stack>
        </Box>
      )}
    </Card>
  )
}