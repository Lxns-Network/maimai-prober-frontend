import {
  Card, Text, Group, Avatar, Badge, ActionIcon, Tooltip, Stack, Box, Collapse, ThemeIcon, Divider, Loader
} from "@mantine/core";
import {
  IconTrash, IconExternalLink, IconCalendar, IconChevronDown, IconChevronUp, IconShield, IconAlertTriangle, IconTool
} from "@tabler/icons-react";
import { useState } from "react";
import { OAuthAppProps } from "@/types/developer";
import { scopeData } from "@/data/scopeData.tsx";
import { useUserOAuthApps } from "@/hooks/swr/useUserOAuthApps.ts";
import classes from "./UserOAuthSection.module.css"
import {revokeUserOAuthApp} from "@/utils/api/user.ts";
import {openConfirmModal, openRetryModal} from "@/utils/modal.tsx";

const ScopeDisplay = ({ scopes }: { scopes: string }) => {
  const [expanded, setExpanded] = useState(false);
  const scopeList = scopes.split(' ');

  const hasHighRiskScope = scopeList.some(scope => scopeData[scope as keyof typeof scopeData]?.high_risk);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <ThemeIcon
            size="sm"
            variant="light"
            color={hasHighRiskScope ? "orange" : "blue"}
          >
            {hasHighRiskScope ? <IconAlertTriangle size={12} /> : <IconShield size={12} />}
          </ThemeIcon>
          <Text size="sm" fw={500}>
            权限范围 ({scopeList.length})
          </Text>
        </Group>
        <ActionIcon
          className={classes.oauthScopeExpandButton}
          variant="subtle"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </ActionIcon>
      </Group>

      <div>
        <Collapse in={expanded}>
          <Stack gap="xs">
            {scopeList.map((scope) => {
              const scopeInfo = scopeData[scope as keyof typeof scopeData];

              return (
                <Card key={scope} className={classes.oauthScopeCard} padding="xs" withBorder radius="sm">
                  {scopeInfo && (
                    <Stack gap={4}>
                      <Text size="sm" fw={500}>
                        {scopeInfo.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {scopeInfo.description}
                      </Text>
                    </Stack>
                  )}
                </Card>
              );
            })}
          </Stack>
        </Collapse>

        {!expanded && (
          <Group gap="xs">
            {scopeList.slice(0, 3).map((scope) => {
              const s = scope as keyof typeof scopeData;
              const scopeInfo = scopeData[s];
              const isHighRisk = scopeData[s]?.high_risk;

              return (
                <Badge
                  key={scope}
                  variant={isHighRisk ? "filled" : "light"}
                  color={isHighRisk ? "orange" : "blue"}
                  size="sm"
                >
                  {scopeInfo?.title || scope}
                </Badge>
              );
            })}
            {scopeList.length > 3 && (
              <Badge variant="outline" size="sm" color="gray">
                +{scopeList.length - 3} 更多
              </Badge>
            )}
          </Group>
        )}
      </div>
    </Stack>
  );
};

const OAuthAppCard = ({ app, onRevoke }: { app: OAuthAppProps, onRevoke: () => void }) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return "未知";
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  const handleDelete = async () => {
    if (!app.client_id) return;
    try {
      const res = await revokeUserOAuthApp(app.client_id);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      onRevoke();
    } catch (error) {
      openRetryModal("撤销授权失败", `${error}`, handleDelete);
    }
  };

  const handleVisitWebsite = () => {
    if (app.website) {
      window.open(app.website, '_blank');
    }
  };

  return (
    <Card className={classes.oauthCard} withBorder radius="md" p={0}>
      <Group align="center" gap="md" style={{ flex: 1 }} m="xs">
        <Avatar src={app.logo_url} radius="sm" >
          {app.name.charAt(0).toUpperCase()}
        </Avatar>

        <div style={{ flex: 1 }}>
          <Group gap={4} align="center">
            <Text fw={600} size="md">
              {app.name}
            </Text>
            {app.website && (
              <ActionIcon
                variant="subtle"
                color="blue"
                size="sm"
                onClick={handleVisitWebsite}
              >
                <IconExternalLink size={14} />
              </ActionIcon>
            )}
          </Group>

          <Group gap="md">
            {app.developer && (
              <Group gap={4}>
                <IconTool size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" c="dimmed">
                  {app.developer.name}
                </Text>
              </Group>
            )}
            {app.user_authorize_time && (
              <Group gap={4}>
                <IconCalendar size={12} style={{ color: 'var(--mantine-color-dimmed)' }} />
                <Text size="xs" c="dimmed">
                  授权于 {formatDate(app.user_authorize_time)}
                </Text>
              </Group>
            )}
          </Group>
        </div>

        <Tooltip label="撤销授权" position="left">
          <ActionIcon
            color="red"
            variant="subtle"
            onClick={() => openConfirmModal("撤销授权", `你确定要撤销对 ${app.name} 的授权吗？撤销后，该应用将无法访问你的查分器数据。`, handleDelete)}
            size="lg"
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Divider />
      <Box m="xs">
        <ScopeDisplay scopes={app.scope} />
      </Box>
    </Card>
  );
};

export const UserOAuthSection = () => {
  const { apps, isLoading, mutate } = useUserOAuthApps();

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Stack gap="md">
        <Box>
          <Group gap="sm">
            <Text fz="lg" fw={700}>
              OAuth 应用
            </Text>
            <Badge variant="light" color="blue">测试版</Badge>
          </Group>
          <Text fz="xs" c="dimmed" mt={3}>
            管理已授权的 OAuth 应用，这些应用可以访问你的查分器数据
          </Text>
        </Box>

        {isLoading ? (
          <Group justify="center" m="md">
            <Loader />
          </Group>
        ) : apps && apps.length > 0 ? (
          <Stack gap="md">
            {apps.map((app) => (
              <OAuthAppCard key={app.client_id || app.name} app={app} onRevoke={mutate} />
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            暂无已授权的 OAuth 应用
          </Text>
        )}
      </Stack>
    </Card>
  );
};