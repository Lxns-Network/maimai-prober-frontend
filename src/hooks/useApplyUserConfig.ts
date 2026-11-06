import { useQueryClient } from "@tanstack/react-query";
import { useUpdateUserConfig } from "@/hooks/mutations/useUserMutations";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { openRetryModal } from "@/utils/modal";
import { Game } from "@/types/game";
import { ConfigProps } from "@/types/user";

/** 乐观写入单项配置后提交完整配置；失败时回滚缓存并弹出重试框。 */
export const useApplyUserConfig = (game: Game) => {
  const queryClient = useQueryClient();
  const { mutate } = useUpdateUserConfig();

  const apply = (key: string, value: unknown) => {
    const queryKey = queryKeys.config.user(game);
    const previousConfig = queryClient.getQueryData<ConfigProps>(queryKey);
    const newConfig = { ...previousConfig, [key]: value } as ConfigProps;
    queryClient.setQueryData<ConfigProps>(queryKey, newConfig);

    mutate(
      { game, data: newConfig },
      {
        onError: (error) => {
          if (previousConfig) queryClient.setQueryData<ConfigProps>(queryKey, previousConfig);
          openRetryModal("保存设置失败", `${error}`, () => apply(key, value));
        },
      },
    );
  };

  return apply;
};
