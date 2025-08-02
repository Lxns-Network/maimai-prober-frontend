import { useEffect, useState } from "react";
import {
  Title, Text, Button, Card, List, ThemeIcon, Group, Container, Box, Divider, Anchor, Loader, Alert, Avatar, CopyButton,
  Stack,
} from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { IconCheck, IconCopy, IconExclamationCircle, IconLink } from "@tabler/icons-react";
import { confirmUserOAuthAuthorize } from "@/utils/api/user.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import classes from "./Authorize.module.css";
import { useOAuthApps } from "@/hooks/swr/useOAuthApp.ts";
import { scopeData } from "@/data/scopeData.tsx";

function isOOBRedirectUri(redirectUri: string | null): boolean {
  if (!redirectUri) return false;
  return redirectUri === "urn:ietf:wg:oauth:2.0:oob" || redirectUri === "urn:ietf:wg:oauth:2.0:oob:auto";
}

export default function Authorize() {
  const [params] = useSearchParams();

  const { app, isLoading, error } = useOAuthApps(params);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    document.title = "授权应用 | maimai DX 查分器";
  }, []);

  useEffect(() => {
    if (!app) return;
    if (app.user_authorized && !isOOBRedirectUri(app.redirect_uri)) {
      setCode("authorized");
      setTimeout(() => {
        handleAuthorize();
      }, 3000);
    }
  }, [app]);

  const handleAuthorize = async () => {
    if (!app) return;
    setIsAuthorizing(true);
    try {
      const res = await confirmUserOAuthAuthorize({
        client_id: params.get("client_id") || "",
        redirect_uri: params.get("redirect_uri") || "",
        scope: params.get("scope") || "",
        state: params.get("state") || "",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (isOOBRedirectUri(app.redirect_uri)) {
        setCode(data.data.code);
      } else {
        const redirect = new URL(app.redirect_uri);
        redirect.searchParams.set("code", data.data.code);
        if (data.data.state) {
          redirect.searchParams.set("state", data.data.state);
        }
        window.location.href = redirect.toString();
      }
    } catch (error) {
      openRetryModal("授权失败", `${error}`, handleAuthorize);
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleDeny = () => {
    if (!app) return;
    if (isOOBRedirectUri(app.redirect_uri)) {
      setCode("unauthorized");
    } else {
      const redirect = new URL(app.redirect_uri);
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

  if (error || !app) {
    return (
      <Container className={classes.root} size={420}>
        <Alert radius="md" icon={<IconExclamationCircle />} title={`无效的应用`} color="red" mb="md">
          <Text size="sm">
            {error instanceof Error && error.message}
          </Text>
        </Alert>
      </Container>
    )
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
      {app.developer && (
        <Text c="dimmed" size="sm" ta="center" mt="sm">
          由 <Anchor className={classes.externalLink} href={app.developer.url} target="_blank" rel="noreferrer">
            {app.developer.name}
          </Anchor> 开发的应用
        </Text>
      )}
      <Card className={classes.card} withBorder shadow="md" p={0} mt={30} radius="md">
        <Box p="lg">
          <Text fz="sm">
            该应用将会获得以下权限：
          </Text>
          <List
            spacing="xs"
            size="sm"
            mt="md"
            icon={
              <ThemeIcon color="blue" size={20} radius="xl">
                <IconCheck size={14} />
              </ThemeIcon>
            }
          >
            {(params.get("scope") || "").split(" ").map((scope) => {
              const s = scope as keyof typeof scopeData;

              if (!scopeData[s]) return (
                <List.Item key={scope}>
                  {scope}
                </List.Item>
              );

              return (
                <List.Item key={scope}>
                  <Text fz="sm">{scopeData[s].title}</Text>
                  <Text fz="xs" c="gray">{scopeData[s].description}</Text>
                </List.Item>
              );
            })}
          </List>
        </Box>
        <Divider />
        {code !== "" ? (
          <Box p="lg" ta="center">
            {code === "unauthorized" && (
              <>
                <Text fz="sm" mb="xs" c="red">
                  授权已取消
                </Text>
                <Text c="dimmed" size="xs">你已取消授权，请关闭此窗口并返回你的应用。</Text>
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
                <Text fz="lg" fw={500} mb="xs">{code}</Text>
                <Text c="dimmed" size="xs">一次性授权码将在十分钟后失效，请尽快使用。</Text>
                <Group grow mt="md">
                  <Button variant="light" color="gray" onClick={() => setCode("")}>
                    重新授权
                  </Button>
                  <CopyButton value={code} timeout={2000}>
                    {({ copied, copy }) => (
                      <Button onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} color={copied ? "teal" : "blue"}>
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
              <Button onClick={handleAuthorize} loading={isAuthorizing}>
                授权应用
              </Button>
            </Group>

            {isOOBRedirectUri(app.redirect_uri) ? (
              <Box mt="sm">
                <Text size="xs" c="dimmed">授权后将会显示授权码，请将其复制到应用中</Text>
              </Box>
            ) : (
              <Box mt="sm">
                <Text size="xs" c="dimmed">授权后将会跳转到</Text>
                <Text size="xs" fw={500} mt={2}>{app.redirect_uri.replace(/^(http|https):\/\/([^/]+).+/, '$1://$2')}</Text>
              </Box>
            )}
          </Box>
        )}
      </Card>
    </Container>
  );
}
