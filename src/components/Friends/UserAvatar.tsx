import { Avatar, type AvatarProps } from "@mantine/core";

export interface UserAvatarProps extends Omit<AvatarProps, "src" | "name" | "color"> {
  username: string;
  avatarUrl?: string;
}

/**
 * 站点账号头像；无自定义头像或图片加载失败时显示用户名缩写，底色按用户名固定，
 * 与 OAuth 授权页的应用图标一致。绝不回退到游戏头像。
 */
export const UserAvatar = ({ username, avatarUrl, ...props }: UserAvatarProps) => (
  <Avatar src={avatarUrl} alt={`${username} 的头像`} name={username} color="initials" {...props} />
);
