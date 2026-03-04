import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { apiMutationFn } from "@/hooks/queries/mutationFn.ts";
import { LogoUploadResponse } from "@/types/api";
import {
  sendDeveloperApply, resetDeveloperApiKey, updateDeveloperInfo,
  uploadOAuthAppLogo, createOAuthApp, editOAuthApp, deleteOAuthApp,
  revokeDeveloper,
} from "@/utils/api/developer.ts";

export const useSendDeveloperApply = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => sendDeveloperApply(data)),
    ...options,
  });
};

export const useResetDeveloperApiKey = (options?: UseMutationOptions<{ api_key: string }, Error, void>) => {
  return useMutation({
    mutationFn: () => apiMutationFn<{ api_key: string }>(() => resetDeveloperApiKey()),
    ...options,
  });
};

export const useUpdateDeveloperInfo = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => updateDeveloperInfo(data)),
    ...options,
  });
};

export const useUploadOAuthAppLogo = (options?: UseMutationOptions<LogoUploadResponse, Error, File>) => {
  return useMutation({
    mutationFn: (file: File) =>
      apiMutationFn<LogoUploadResponse>(() => uploadOAuthAppLogo(file)),
    ...options,
  });
};

export const useCreateOAuthApp = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => createOAuthApp(data)),
    ...options,
  });
};

export const useEditOAuthApp = (options?: UseMutationOptions<unknown, Error, { clientId: string; data: object }>) => {
  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: object }) =>
      apiMutationFn(() => editOAuthApp(clientId, data)),
    ...options,
  });
};

export const useDeleteOAuthApp = (options?: UseMutationOptions<unknown, Error, string>) => {
  return useMutation({
    mutationFn: (clientId: string) => apiMutationFn(() => deleteOAuthApp(clientId)),
    ...options,
  });
};

// Admin
export const useRevokeDeveloper = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => revokeDeveloper(data)),
    ...options,
  });
};
