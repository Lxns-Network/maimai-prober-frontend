import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Center, Container, Loader, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCircleCheck, IconLinkOff } from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-react/usePageContext";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirmEmailVerification } from "@/hooks/mutations/useUserMutations.ts";
import { queryKeys } from "@/hooks/queries/queryKeys.ts";
import classes from "../Form.module.css";

type VerificationState = "verifying" | "verified" | "error";

export default function VerifyEmail() {
  const pageContext = usePageContext();
  const queryClient = useQueryClient();
  const token = useMemo(
    () => new URLSearchParams(pageContext.urlParsed.search).get("token") ?? "",
    [pageContext.urlParsed.search],
  );
  const verificationStarted = useRef(false);
  const [state, setState] = useState<VerificationState>(token ? "verifying" : "error");
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "验证链接缺少必要参数，请返回账号详情重新发送验证邮件。",
  );
  const { mutate: confirmEmailVerification } = useConfirmEmailVerification();

  useEffect(() => {
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;
    confirmEmailVerification(token, {
      onSuccess: () => {
        setState("verified");
        void queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
      },
      onError: () => {
        setErrorMessage("验证链接无效或已过期，请返回账号详情重新发送验证邮件。");
        setState("error");
      },
    });
  }, [confirmEmailVerification, queryClient, token]);

  return (
    <Container className={classes.root} size={420}>
      <Card className={classes.card} withBorder shadow="md" p={34} radius="md" ta="center">
        {state === "verifying" ? (
          <>
            <Center h={64}>
              <Loader size="lg" />
            </Center>
            <Title order={2} size="h3" mt="lg">
              正在验证邮箱
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              正在确认当前邮箱地址，请稍候。
            </Text>
          </>
        ) : state === "verified" ? (
          <>
            <Center>
              <ThemeIcon color="green" variant="light" size={64} radius="xl">
                <IconCircleCheck size={36} />
              </ThemeIcon>
            </Center>
            <Title order={2} size="h3" mt="lg">
              邮箱验证成功
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              当前邮箱地址已完成验证。
            </Text>
            <Button fullWidth mt="xl" onClick={() => navigate("/user/profile")}>
              返回账号详情
            </Button>
          </>
        ) : (
          <>
            <Center>
              <ThemeIcon color="red" variant="light" size={64} radius="xl">
                <IconLinkOff size={34} />
              </ThemeIcon>
            </Center>
            <Title order={2} size="h3" mt="lg">
              验证链接不可用
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              {errorMessage}
            </Text>
            <Button fullWidth variant="default" mt="xl" onClick={() => navigate("/user/profile")}>
              返回账号详情
            </Button>
          </>
        )}
      </Card>
    </Container>
  );
}
