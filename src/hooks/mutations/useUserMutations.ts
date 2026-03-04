import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { apiMutationFn } from "@/hooks/queries/mutationFn.ts";
import { OAuthAuthorizeResponse } from "@/types/api";
import {
  updateUserProfile, updateUserBind, generateUserToken, logoutUser,
  editUserPassword, deleteSelfUser, updateUserConfig,
  confirmUserOAuthAuthorize, revokeUserOAuthApp,
  registerPasskey, deletePasskey, updatePasskeyName, authenticatePasskey,
  deleteUsers, sendBatchEmail, updateUser, deleteUser,
} from "@/utils/api/user.ts";
import type {
  PasskeyRegisterData,
  PasskeyAuthenticateData,
  PasskeyUpdateNameData,
} from "@/types/user";

export const useUpdateUserProfile = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => updateUserProfile(data)),
    ...options,
  });
};

export const useUpdateUserBind = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => updateUserBind(data)),
    ...options,
  });
};

export const useGenerateUserToken = (options?: UseMutationOptions<{ token: string }, Error, void>) => {
  return useMutation({
    mutationFn: () => apiMutationFn<{ token: string }>(() => generateUserToken()),
    ...options,
  });
};

export const useLogoutUser = (options?: UseMutationOptions<unknown, Error, void>) => {
  return useMutation({
    mutationFn: () => apiMutationFn(() => logoutUser()),
    ...options,
  });
};

export const useEditUserPassword = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => editUserPassword(data)),
    ...options,
  });
};

export const useDeleteSelfUser = (options?: UseMutationOptions<unknown, Error, void>) => {
  return useMutation({
    mutationFn: () => apiMutationFn(() => deleteSelfUser()),
    ...options,
  });
};

export const useUpdateUserConfig = (options?: UseMutationOptions<unknown, Error, { game: string; data: object }>) => {
  return useMutation({
    mutationFn: ({ game, data }: { game: string; data: object }) =>
      apiMutationFn(() => updateUserConfig(game, data)),
    ...options,
  });
};

export const useConfirmOAuthAuthorize = (options?: UseMutationOptions<OAuthAuthorizeResponse, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn<OAuthAuthorizeResponse>(() => confirmUserOAuthAuthorize(data)),
    ...options,
  });
};

export const useRevokeUserOAuthApp = (options?: UseMutationOptions<unknown, Error, string>) => {
  return useMutation({
    mutationFn: (clientId: string) => apiMutationFn(() => revokeUserOAuthApp(clientId)),
    ...options,
  });
};

export const useRegisterPasskey = (options?: UseMutationOptions<unknown, Error, PasskeyRegisterData>) => {
  return useMutation({
    mutationFn: (data: PasskeyRegisterData) => apiMutationFn(() => registerPasskey(data)),
    ...options,
  });
};

export const useDeletePasskey = (options?: UseMutationOptions<unknown, Error, number>) => {
  return useMutation({
    mutationFn: (id: number) => apiMutationFn(() => deletePasskey(id)),
    ...options,
  });
};

export const useUpdatePasskeyName = (options?: UseMutationOptions<unknown, Error, { id: number; data: PasskeyUpdateNameData }>) => {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PasskeyUpdateNameData }) =>
      apiMutationFn(() => updatePasskeyName(id, data)),
    ...options,
  });
};

export const useAuthenticatePasskey = (options?: UseMutationOptions<unknown, Error, PasskeyAuthenticateData>) => {
  return useMutation({
    mutationFn: (data: PasskeyAuthenticateData) => apiMutationFn(() => authenticatePasskey(data)),
    ...options,
  });
};

// Admin mutations
export const useDeleteUsers = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => deleteUsers(data)),
    ...options,
  });
};

export const useSendBatchEmail = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: (data: object) => apiMutationFn(() => sendBatchEmail(data)),
    ...options,
  });
};

export const useUpdateUser = (options?: UseMutationOptions<unknown, Error, { userId: number; data: object }>) => {
  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: object }) =>
      apiMutationFn(() => updateUser(userId, data)),
    ...options,
  });
};

export const useDeleteUser = (options?: UseMutationOptions<unknown, Error, number>) => {
  return useMutation({
    mutationFn: (userId: number) => apiMutationFn(() => deleteUser(userId)),
    ...options,
  });
};

