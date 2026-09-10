import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import { LogoUploadResponse } from "@/types/api";
import {
  sendDeveloperApply,
  resetDeveloperApiKey,
  updateDeveloperInfo,
  uploadOAuthAppLogo,
  createOAuthApp,
  editOAuthApp,
  deleteOAuthApp,
} from "@/utils/api/developer.ts";

export const useSendDeveloperApply = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: async (data: object) => parseAPIResponse(await sendDeveloperApply(data)),
    ...options,
  });
};

export const useResetDeveloperApiKey = (
  options?: UseMutationOptions<{ api_key: string }, Error, void>,
) => {
  return useMutation({
    mutationFn: async () => parseAPIResponse<{ api_key: string }>(await resetDeveloperApiKey()),
    ...options,
  });
};

export const useUpdateDeveloperInfo = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: async (data: object) => parseAPIResponse(await updateDeveloperInfo(data)),
    ...options,
  });
};

export const useUploadOAuthAppLogo = (
  options?: UseMutationOptions<LogoUploadResponse, Error, File>,
) => {
  return useMutation({
    mutationFn: async (file: File) =>
      parseAPIResponse<LogoUploadResponse>(await uploadOAuthAppLogo(file)),
    ...options,
  });
};

export const useCreateOAuthApp = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: async (data: object) => parseAPIResponse(await createOAuthApp(data)),
    ...options,
  });
};

export const useEditOAuthApp = (
  options?: UseMutationOptions<unknown, Error, { clientId: string; data: object }>,
) => {
  return useMutation({
    mutationFn: async ({ clientId, data }: { clientId: string; data: object }) =>
      parseAPIResponse(await editOAuthApp(clientId, data)),
    ...options,
  });
};

export const useDeleteOAuthApp = (options?: UseMutationOptions<unknown, Error, string>) => {
  return useMutation({
    mutationFn: async (clientId: string) => parseAPIResponse(await deleteOAuthApp(clientId)),
    ...options,
  });
};
