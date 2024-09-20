export interface UserProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  bind: UserBindProps;
  token?: string;
}

export interface UserBindProps {
  qq?: number;
}