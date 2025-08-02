import { Mark } from "@mantine/core";

export const scopeData = {
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
    description: <>
      个人 API 密钥对你绑定的游戏数据拥有<Mark>完全访问权限</Mark>。
    </>,
    high_risk: true,
  },
}