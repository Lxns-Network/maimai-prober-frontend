import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Title,
  Text,
  Button,
  Card,
  Checkbox,
  List,
  ThemeIcon,
  Group,
  Container,
  Box,
  Divider,
  Anchor,
  Loader,
  Alert,
  Avatar,
  CopyButton,
  Stack,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconExclamationCircle,
  IconLink,
} from "@tabler/icons-react";
import { openRetryModal } from "@/utils/modal.tsx";
import classes from "./Authorize.module.css";
import { useOAuthApp } from "@/hooks/queries/useOAuthApp.ts";
import { useConfirmOAuthAuthorize } from "@/hooks/mutations/useUserMutations.ts";
import { scopeData } from "@/data/scopeData.tsx";
import { usePageContext } from "vike-react/usePageContext";

function isOOBRedirectUri(redirectUri: string | null): boolean {
  if (!redirectUri) return false;
  return (
    redirectUri === "urn:ietf:wg:oauth:2.0:oob" || redirectUri === "urn:ietf:wg:oauth:2.0:oob:auto"
  );
}

function isAppSchemeRedirectUri(redirectUri: string | null): boolean {
  if (!redirectUri) return false;
  try {
    const scheme = new URL(redirectUri).protocol.replace(/:$/, "");
    return scheme !== "http" && scheme !== "https";
  } catch {
    return false;
  }
}

function filterDependentOIDCScopes(scopes: string[]): string[] {
  if (scopes.includes("openid")) return scopes;
  return scopes.filter((scope) => scope !== "profile" && scope !== "email");
}

function resolveRedirectUri(
  redirectUris: string[] | undefined,
  legacyRedirectUri: string | undefined,
  requestedRedirectUri: string | null,
): string | null {
  let registeredRedirectUris = redirectUris ?? [];
  if (registeredRedirectUris.length === 0 && legacyRedirectUri) {
    registeredRedirectUris = [legacyRedirectUri];
  }
  if (requestedRedirectUri) {
    return registeredRedirectUris.includes(requestedRedirectUri) ? requestedRedirectUri : null;
  }
  return registeredRedirectUris.length === 1 ? registeredRedirectUris[0] : null;
}

export default function Authorize() {
  const pageContext = usePageContext();
  const params = useMemo(
    () => new URLSearchParams(pageContext.urlParsed.search),
    [pageContext.urlParsed.search],
  );
  const { app, isLoading, error } = useOAuthApp(params);
  const { mutateAsync: confirmOAuthAuthorize } = useConfirmOAuthAuthorize();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [code, setCode] = useState("");
  const redirectUri = resolveRedirectUri(
    app?.redirect_uris,
    app?.redirect_uri,
    params.get("redirect_uri"),
  );
  const requestedScopes = useMemo(
    () => (params.get("scope") || "").split(" ").filter(Boolean),
    [params],
  );
  const [selectedScopes, setSelectedScopes] = useState<string[]>(requestedScopes);
  useEffect(() => {
    setSelectedScopes(requestedScopes);
  }, [requestedScopes]);
  // only ever offer/grant scopes the client is actually registered for — clients may over-request
  // (e.g. an MCP client reading the AS metadata picks up read_user_token, which is not an MCP scope)
  const registeredScope = app?.scope ?? "";
  const allowedScopes = useMemo(() => {
    const registeredScopes = registeredScope.split(" ").filter(Boolean);
    return filterDependentOIDCScopes(
      requestedScopes.filter((scope) => registeredScopes.includes(scope)),
    );
  }, [registeredScope, requestedScopes]);
  const effectiveScopes = useMemo(
    () =>
      app?.is_dynamic
        ? selectedScopes.filter((scope) => allowedScopes.includes(scope))
        : allowedScopes,
    [allowedScopes, app?.is_dynamic, selectedScopes],
  );

  const handleAuthorize = useCallback(async () => {
    if (!app || !redirectUri || effectiveScopes.length === 0) return;
    setIsAuthorizing(true);
    try {
      const resource = params.get("resource");
      const nonce = params.get("nonce");
      const data = await confirmOAuthAuthorize({
        client_id: params.get("client_id") || "",
        response_type: params.get("response_type") || "",
        redirect_uri: redirectUri || "",
        scope: effectiveScopes.join(" "),
        code_challenge: params.get("code_challenge") || "",
        code_challenge_method: params.get("code_challenge_method") || "",
        state: params.get("state") || "",
        ...(nonce ? { nonce } : {}),
        ...(resource ? { resource } : {}),
      });
      if (isOOBRedirectUri(redirectUri)) {
        setCode(data.code);
      } else if (redirectUri) {
        const redirect = new URL(redirectUri);
        redirect.searchParams.set("code", data.code);
        if (data.state) {
          redirect.searchParams.set("state", data.state);
        }
        window.location.href = redirect.toString();
      }
    } catch (error) {
      openRetryModal("授权失败", `${error}`, handleAuthorize);
    } finally {
      setIsAuthorizing(false);
    }
  }, [app, confirmOAuthAuthorize, effectiveScopes, params, redirectUri]);

  useEffect(() => {
    if (
      !app ||
      !redirectUri ||
      effectiveScopes.length === 0 ||
      app.is_dynamic ||
      !app.user_authorized ||
      isOOBRedirectUri(redirectUri)
    )
      return;
    setCode("authorized");
    const timer = window.setTimeout(() => {
      void handleAuthorize();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [app, effectiveScopes.length, handleAuthorize, redirectUri]);

  const handleDeny = () => {
    if (!app || !redirectUri) return;
    if (isOOBRedirectUri(redirectUri)) {
      setCode("unauthorized");
    } else if (redirectUri) {
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("error", "access_denied");
      if (params.get("state")) {
        redirect.searchParams.set("state", params.get("state") || "");
      }
      window.location.href = redirect.toString();
    }
  };

  if (isLoading) {
    return (
      <Group justify="center" mt={80}>
        <Loader />
      </Group>
    );
  }

  if (error || !app || !redirectUri || allowedScopes.length === 0) {
    return (
      <Container className={classes.root} size={420}>
        <Alert
          radius="md"
          icon={<IconExclamationCircle />}
          title="无效的授权请求"
          color="red"
          mb="md"
        >
          <Text size="sm">
            {error instanceof Error
              ? error.message
              : !redirectUri
                ? "请求中的回调地址缺失或未在应用中注册"
                : allowedScopes.length === 0
                  ? "应用未请求任何可授权的权限"
                  : "无法读取应用信息"}
          </Text>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className={classes.root} size={420}>
      <Group justify="center" mb={24}>
        <Avatar src={app.logo_url} w={72} h={72} radius="md" name={app.name} color="initials" />
        <ThemeIcon variant="subtle" radius="md" color="gray">
          <IconLink size={32} />
        </ThemeIcon>
        <Avatar src="/favicon_oauth.webp" w={72} h={72} radius="md" />
      </Group>
      <Title order={2} size="h2" fw={700} ta="center">
        授权 {app.name}
      </Title>
      {app.is_dynamic ? (
        <Alert
          variant="light"
          color="yellow"
          radius="md"
          icon={<IconAlertTriangle />}
          title="未验证应用"
          mt="lg"
        >
          <Text size="sm">该应用未经审核，请确认你信任它后再继续授权。</Text>
        </Alert>
      ) : (
        app.developer && (
          <Text c="dimmed" size="sm" ta="center" mt="sm">
            由{" "}
            <Anchor
              className={classes.externalLink}
              href={app.developer.url}
              target="_blank"
              rel="noreferrer"
            >
              {app.developer.name}
            </Anchor>{" "}
            开发的应用
          </Text>
        )
      )}
      <Card className={classes.card} withBorder shadow="md" p={0} mt={30} radius="md">
        <Box p="lg">
          <Text fz="sm">
            {app.is_dynamic ? "请选择要授予该应用的权限：" : "该应用将会获得以下权限："}
          </Text>
          {app.is_dynamic ? (
            <Checkbox.Group
              value={selectedScopes}
              onChange={(scopes) => setSelectedScopes(filterDependentOIDCScopes(scopes))}
            >
              <Stack gap="sm" mt="md">
                {allowedScopes.map((scope) => {
                  const s = scope as keyof typeof scopeData;
                  const meta = scopeData[s];

                  return (
                    <Checkbox
                      key={scope}
                      value={scope}
                      label={meta ? meta.title : scope}
                      description={meta?.description}
                      disabled={
                        (scope === "profile" || scope === "email") &&
                        !selectedScopes.includes("openid")
                      }
                    />
                  );
                })}
              </Stack>
            </Checkbox.Group>
          ) : (
            <List
              spacing="xs"
              size="sm"
              mt="md"
              icon={
                <ThemeIcon size={20} radius="xl">
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              {allowedScopes.map((scope) => {
                const s = scope as keyof typeof scopeData;

                if (!scopeData[s]) return <List.Item key={scope}>{scope}</List.Item>;

                return (
                  <List.Item key={scope}>
                    <Text fz="sm">{scopeData[s].title}</Text>
                    <Text fz="xs" c="gray">
                      {scopeData[s].description}
                    </Text>
                  </List.Item>
                );
              })}
            </List>
          )}
        </Box>
        <Divider />
        {code !== "" ? (
          <Box p="lg" ta="center">
            {code === "unauthorized" && (
              <>
                <Text fz="sm" mb="xs" c="red">
                  授权已取消
                </Text>
                <Text c="dimmed" size="xs">
                  你已取消授权，请关闭此窗口并返回你的应用。
                </Text>
              </>
            )}
            {code === "authorized" && (
              <Stack align="center" mt={-8}>
                <Loader type="dots" />
                <Text size="xs" c="dimmed">
                  你已经授权过此应用，即将跳转到应用页面
                </Text>
              </Stack>
            )}
            {code !== "unauthorized" && code !== "authorized" && (
              <>
                <Text fz="sm" mb="xs">
                  授权成功！请将以下授权码复制到应用中：
                </Text>
                <Text fz="lg" fw={500} mb="xs">
                  {code}
                </Text>
                <Text c="dimmed" size="xs">
                  一次性授权码将在十分钟后失效，请尽快使用。
                </Text>
                <Group grow mt="md">
                  <Button variant="light" color="gray" onClick={() => setCode("")}>
                    重新授权
                  </Button>
                  <CopyButton value={code} timeout={2000}>
                    {({ copied, copy }) => (
                      <Button
                        onClick={copy}
                        leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                        color={copied ? "teal" : undefined}
                      >
                        {copied ? "已复制" : "复制授权码"}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </>
            )}
          </Box>
        ) : (
          <Box p="lg" ta="center">
            <Group grow>
              <Button variant="light" color="gray" onClick={handleDeny}>
                取消
              </Button>
              <Button
                onClick={handleAuthorize}
                loading={isAuthorizing}
                disabled={app.is_dynamic && effectiveScopes.length === 0}
              >
                授权应用
              </Button>
            </Group>

            {isOOBRedirectUri(redirectUri) ? (
              <Box mt="sm">
                <Text size="xs" c="dimmed">
                  授权后将会显示授权码，请将其复制到应用中
                </Text>
              </Box>
            ) : isAppSchemeRedirectUri(redirectUri) ? (
              <Box mt="sm">
                <Text size="xs" c="dimmed">
                  授权后将会跳转回
                </Text>
                <Text size="xs" fw={500} mt={2}>
                  {app.name}
                </Text>
              </Box>
            ) : (
              <Box mt="sm">
                <Text size="xs" c="dimmed">
                  授权后将会跳转到
                </Text>
                <Text size="xs" fw={500} mt={2}>
                  {redirectUri?.replace(/^(http|https):\/\/([^/]+).+/, "$1://$2")}
                </Text>
              </Box>
            )}
          </Box>
        )}
      </Card>
    </Container>
  );
}
