import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserProps } from "@/types/user";
import { queryKeys } from "./queryKeys.ts";

export const useUser = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<UserProps>({
    queryKey: queryKeys.user.profile(),
  });

  return {
    user: data,
    isLoading,
    error,
    setData: (updater: UserProps | ((prev: UserProps | undefined) => UserProps | undefined)) =>
      queryClient.setQueryData<UserProps>(queryKeys.user.profile(), updater),
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() }),
  };
};
