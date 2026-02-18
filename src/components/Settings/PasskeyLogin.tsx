import { Button, Stack, Divider } from "@mantine/core";
import { IconFingerprint } from "@tabler/icons-react";
import { useState } from "react";
import { authenticatePasskey, getPasskeyLoginChallenge } from "@/utils/api/user";
import { openAlertModal, openRetryModal } from "@/utils/modal";
import { startAuthentication } from '@simplewebauthn/browser';
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-react/usePageContext";

export const PasskeyLogin = () => {
  const [loading, setLoading] = useState(false);
  const pageContext = usePageContext();

  const handlePasskeyLogin = async () => {
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        openAlertModal("登录失败", "你的浏览器不支持通行密钥，请使用现代浏览器。");
        return;
      }

      const challengeRes = await getPasskeyLoginChallenge();
      const challengeData = await challengeRes.json();
      if (!challengeData.success) {
        throw new Error(challengeData.message);
      }

      const authenticationResult = await startAuthentication({
        optionsJSON: challengeData.data.publicKey,
      });

      if (!authenticationResult) {
        openRetryModal("登录失败", "通行密钥认证未完成。", handlePasskeyLogin);
        return;
      }

      const authRes = await authenticatePasskey({
        credential: authenticationResult,
      });
      const authData = await authRes.json();
      if (!authData.success) {
        openRetryModal("登录失败", authData.message, handlePasskeyLogin);
        return;
      }

      localStorage.setItem("token", authData.data.token);

      if (pageContext.redirect && pageContext.redirect !== "/login" && pageContext.redirect !== "/register") {
        navigate(pageContext.redirect, { pageContext: { redirect: undefined } });
      } else {
        navigate("/", { pageContext: { redirect: undefined } });
      }
    } catch (error) {
      if ((error as Error).name === "NotAllowedError") {
        return;
      }
      openRetryModal("登录失败", `${error}`, handlePasskeyLogin);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="sm" mt="sm">
      <Divider label="或" labelPosition="center" />
      <Button
        variant="outline"
        leftSection={<IconFingerprint />}
        loading={loading}
        onClick={handlePasskeyLogin}
      >
        使用通行密钥登录
      </Button>
    </Stack>
  );
};
