import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DeveloperProps } from "@/types/developer";
import { queryKeys } from "./queryKeys.ts";

export const useDeveloper = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<DeveloperProps>({
    queryKey: queryKeys.developer.apply(),
  });

  return {
    developer: data,
    isLoading,
    error,
    setData: (updater: DeveloperProps | ((prev: DeveloperProps | undefined) => DeveloperProps | undefined)) =>
      queryClient.setQueryData<DeveloperProps>(queryKeys.developer.apply(), updater),
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.developer.apply() }),
  };
};
