import { Avatar, type AvatarProps } from "@mantine/core";

export interface UserAvatarProps extends Omit<AvatarProps, "src" | "name" | "color"> {
  username: string;
  avatarUrl?: string;
}

export const UserAvatar = ({ username, avatarUrl, ...props }: UserAvatarProps) => (
  <Avatar src={avatarUrl} alt={`${username} 的头像`} name={username} color="initials" {...props} />
);
