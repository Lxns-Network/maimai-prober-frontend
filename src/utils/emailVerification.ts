export function emailVerificationSentMessage(expiresIn?: number): string {
  if (!expiresIn || expiresIn <= 0) return "请尽快前往邮箱完成验证。";
  return `请在 ${Math.ceil(expiresIn / 60)} 分钟内前往邮箱完成验证。`;
}
