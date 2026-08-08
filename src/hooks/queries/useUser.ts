import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { UserProps } from "@/types/user";
import { queryKeys } from "./queryKeys.ts";

export const useUser = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<UserProps>({
    queryKey: queryKeys.user.profile(),
  });
  const setData = useCallback(
    (updater: UserProps | ((prev: UserProps | undefined) => UserProps | undefined)) =>
      queryClient.setQueryData<UserProps>(queryKeys.user.profile(), updater),
    [queryClient],
  );
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() }),
    [queryClient],
  );

  return {
    user: data,
    isLoading,
    error,
    setData,
    invalidate,
  };
};
