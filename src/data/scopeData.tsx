import { Mark } from "@mantine/core";

export const scopeData = {
  openid: {
    title: "验证用户身份",
    description: "允许应用通过 OpenID Connect 获取你的稳定用户标识。",
    high_risk: false,
  },
  profile: {
    title: "读取基本资料",
    description: "包括你的用户名等基本资料，需要同时允许验证用户身份。",
    high_risk: false,
  },
  email: {
    title: "读取邮箱地址",
    description: "允许应用读取你的邮箱地址，需要同时允许验证用户身份。",
    high_risk: false,
  },
  read_user_profile: {
    title: "读取用户信息",
    description: "包括你的用户名、邮箱等基本信息。",
    high_risk: false,
  },
  read_player: {
    title: "读取玩家数据",
    description: "包括你的玩家信息、谱面成绩、历史成绩等信息。",
    high_risk: false,
  },
  write_player: {
    title: "写入玩家数据",
    description: "包括更新你的玩家信息、上传成绩、删除成绩等操作。",
    high_risk: true,
  },
  read_user_token: {
    title: "读取个人 API 密钥",
    description: (
      <>
        个人 API 密钥对你绑定的游戏数据拥有<Mark>完全访问权限</Mark>。
      </>
    ),
    high_risk: true,
  },
};

export const scopeGroups = [
  {
    key: "oauth",
    title: "API 授权",
    protocol: "OAuth 2.0",
    description: "用于调用查分器 API，按应用实际需要选择最小权限范围。",
    scopes: ["read_user_profile", "read_player", "write_player", "read_user_token"],
  },
  {
    key: "oidc",
    title: "登录与身份",
    protocol: "OpenID Connect",
    description: "用于识别登录用户；如需基本资料或邮箱，请在验证身份的基础上继续选择。",
    scopes: ["openid", "profile", "email"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  title: string;
  protocol: string;
  description: string;
  scopes: ReadonlyArray<keyof typeof scopeData>;
}>;
