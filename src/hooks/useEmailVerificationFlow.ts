import { useCallback, useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { openRetryModal } from "@/utils/modal.tsx";
import { useSendEmailVerification } from "@/hooks/mutations/useUserMutations.ts";
import { emailVerificationSentMessage } from "@/utils/emailVerification.ts";
import { useEmailVerificationPolling } from "@/hooks/useEmailVerificationPolling.ts";

interface EmailVerificationFlowOptions {
  /** 当前邮箱是否已验证（来自 user.email_verified）。 */
  verified: boolean;
  /** 刷新用户数据（useUser().invalidate）。 */
  invalidate: () => Promise<unknown>;
  /** 验证完成时的通知正文，页面各自决定文案。 */
  verifiedMessage: string;
}

/**
 * 邮箱验证的完整流程：发送验证邮件 → 轮询等待验证 → 验证成功通知。
 * 账号详情与开发者申请共用，避免两份状态机各自漂移。
 */
export function useEmailVerificationFlow({
  verified,
  invalidate,
  verifiedMessage,
}: EmailVerificationFlowOptions) {
  const [verificationSent, setVerificationSent] = useState(false);
  const { mutate: sendEmailVerification, isPending: isSending } = useSendEmailVerification();
  const { checkNow, isChecking, timedOut } = useEmailVerificationPolling({
    active: verificationSent,
    verified,
    invalidate,
  });

  useEffect(() => {
    if (!verificationSent || !verified) return;
    setVerificationSent(false);
    notifications.show({
      title: "邮箱验证成功",
      message: verifiedMessage,
      color: "green",
    });
  }, [verified, verificationSent, verifiedMessage]);

  const sendVerification = useCallback(() => {
    const run = () => {
      sendEmailVerification(undefined, {
        onSuccess: (result) => {
          if (result.email_verified) {
            void invalidate();
            notifications.show({
              title: "邮箱已验证",
              message: "当前邮箱已经完成验证。",
              color: "green",
            });
            return;
          }
          notifications.show({
            title: "验证邮件已发送",
            message: emailVerificationSentMessage(result.expires_in),
            color: "green",
          });
          setVerificationSent(true);
        },
        onError: (error) => {
          openRetryModal("发送失败", `${error}`, run);
        },
      });
    };
    run();
  }, [invalidate, sendEmailVerification]);

  /** 作废"验证邮件已发送"状态（例如换绑了新邮箱）。 */
  const resetVerificationSent = useCallback(() => setVerificationSent(false), []);

  return {
    verificationSent,
    sendVerification,
    isSending,
    checkNow,
    isChecking,
    timedOut,
    resetVerificationSent,
  };
}
