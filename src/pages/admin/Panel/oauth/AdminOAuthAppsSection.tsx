import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  Avatar,
  Box,
  Card,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch, IconTool } from "@tabler/icons-react";
import { motion } from "motion/react";
import { AnimatedStack } from "@/components/AnimatedGrid.tsx";
import { EmptyState } from "@/components/EmptyState.tsx";
import { ResponsivePagination } from "@/components/ResponsivePagination.tsx";
import { VerifiedBadge } from "@/components/VerifiedBadge.tsx";
import { useAdminOAuthApps } from "@/hooks/queries/useAdminOAuthApps.ts";
import { useVerifyOAuthApp } from "@/hooks/mutations/useDeveloperMutations.ts";
import { OAuthAppProps } from "@/types/developer";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { filterOAuthApps } from "@/utils/oauthAppSearch.ts";

const PAGE_SIZE = 10;

const OAuthAppRow = ({ app, onToggle }: { app: OAuthAppProps; onToggle: () => void }) => (
  <Card withBorder radius="md" w="100%" p="sm">
    <Group wrap="nowrap" gap="md">
      <Avatar src={app.logo_url} radius="sm">
        {app.name.charAt(0).toUpperCase()}
      </Avatar>
      <Box flex={1} miw={0}>
        <Group gap={4} wrap="nowrap">
          <Text fw={500} size="md" truncate>
            {app.name}
          </Text>
          {app.is_verified && <VerifiedBadge />}
        </Group>
        <Group gap="md" mt={2}>
          <Group gap={4} wrap="nowrap">
            <IconTool size={12} style={{ color: "var(--mantine-color-dimmed)" }} />
            <Text size="xs" c="dimmed">
              {app.developer?.name ?? "未知开发者"}
            </Text>
          </Group>
          {app.website && (
            <Anchor size="xs" href={app.website} target="_blank" rel="noreferrer" truncate>
              {app.website.replace(/(^\w+:|^)\/\//, "")}
            </Anchor>
          )}
        </Group>
      </Box>
      <Switch
        checked={!!app.is_verified}
        onChange={onToggle}
        label="已验证"
        labelPosition="left"
        aria-label={`${app.name} 已验证`}
      />
    </Group>
  </Card>
);

export const AdminOAuthAppsSection = () => {
  const { apps, isLoading, error, refetch, invalidate } = useAdminOAuthApps();
  const { mutate: mutateVerify } = useVerifyOAuthApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  const filteredApps = useMemo(() => filterOAuthApps(apps, search), [apps, search]);
  const totalPages = Math.ceil(filteredApps.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const displayApps = filteredApps.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleVerified = (app: OAuthAppProps) => {
    if (!app.client_id) return;
    const clientId = app.client_id;
    const verified = !app.is_verified;
    const submit = () =>
      mutateVerify(
        { clientId, verified },
        {
          onSuccess: () => invalidate(),
          onError: (err) =>
            openRetryModal(verified ? "验证失败" : "取消验证失败", `${err}`, submit),
        },
      );
    openConfirmModal(
      verified ? "验证应用" : "取消验证",
      verified
        ? `确定要将 ${app.name} 标记为已验证吗？授权页面和应用列表将对用户显示已验证标识。`
        : `确定要取消 ${app.name} 的验证吗？`,
      submit,
    );
  };

  useEffect(() => {
    if (error) openRetryModal("OAuth 应用列表获取失败", `${error}`, () => refetch());
  }, [error, refetch]);

  const pagination = totalPages > 1 && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{ width: "100%", minWidth: 0 }}
    >
      <ResponsivePagination total={totalPages} value={currentPage} onChange={handlePageChange} />
    </motion.div>
  );

  return (
    <div ref={topRef} style={{ scrollMarginTop: 16 }}>
      <Stack align="center">
        <TextInput
          w="100%"
          placeholder="搜索应用、开发者、网站、Client ID"
          aria-label="搜索 OAuth 应用"
          radius="md"
          leftSection={<IconSearch size={18} />}
          value={search}
          onChange={(event) => handleSearchChange(event.currentTarget.value)}
        />
        {pagination}
        {isLoading && (
          <Group justify="center">
            <Loader />
          </Group>
        )}
        {!isLoading && apps.length === 0 && <EmptyState title="暂无 OAuth 应用" />}
        {!isLoading && apps.length > 0 && filteredApps.length === 0 && (
          <EmptyState title="没有匹配的 OAuth 应用" />
        )}
        <AnimatedStack
          items={displayApps}
          getKey={(app) => app.client_id ?? app.name}
          renderItem={(app) => <OAuthAppRow app={app} onToggle={() => toggleVerified(app)} />}
        />
        {pagination}
      </Stack>
    </div>
  );
};
