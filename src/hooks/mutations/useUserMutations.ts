import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import { OAuthAuthorizeResponse } from "@/types/api";
import {
  updateUserProfile,
  updateUserBind,
  generateUserToken,
  logoutUser,
  editUserPassword,
  updateUserConfig,
  confirmUserOAuthAuthorize,
  revokeUserOAuthApp,
  sendBatchEmail,
  updateUser,
  deleteUser,
  sendEmailVerification,
  confirmEmailVerification,
} from "@/utils/api/user.ts";
import type { EmailVerificationSendResponse } from "@/types/user";

export const useSendEmailVerification = (
  options?: UseMutationOptions<EmailVerificationSendResponse, Error, void>,
) => {
  return useMutation({
    mutationFn: async () =>
      parseAPIResponse<EmailVerificationSendResponse>(await sendEmailVerification()),
    ...options,
  });
};

export const useConfirmEmailVerification = (
  options?: UseMutationOptions<{ email_verified: boolean }, Error, string>,
) => {
  return useMutation({
    mutationFn: async (token: string) =>
      parseAPIResponse<{ email_verified: boolean }>(await confirmEmailVerification(token)),
    ...options,
  });
};

export const useUpdateUserProfile = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: async (data: object) => parseAPIResponse(await updateUserProfile(data)),
    ...options,
  });
};

export const useUpdateUserBind = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: async (data: object) => parseAPIResponse(await updateUserBind(data)),
    ...options,
  });
};

export const useGenerateUserToken = (
  options?: UseMutationOptions<{ token: string }, Error, void>,
) => {
  return useMutation({
    mutationFn: async () => parseAPIResponse<{ token: string }>(await generateUserToken()),
    ...options,
  });
};

export const useLogoutUser = (options?: UseMutationOptions<unknown, Error, void>) => {
  return useMutation({
    mutationFn: async () => parseAPIResponse(await logoutUser()),
    ...options,
  });
};

export const useEditUserPassword = (
  options?: UseMutationOptions<{ token: string }, Error, object>,
) => {
  return useMutation({
    mutationFn: async (data: object) =>
      parseAPIResponse<{ token: string }>(await editUserPassword(data)),
    ...options,
  });
};

export const useUpdateUserConfig = (
  options?: UseMutationOptions<unknown, Error, { game: string; data: object }>,
) => {
  return useMutation({
    mutationFn: async ({ game, data }: { game: string; data: object }) =>
      parseAPIResponse(await updateUserConfig(game, data)),
    ...options,
  });
};

export const useConfirmOAuthAuthorize = (
  options?: UseMutationOptions<OAuthAuthorizeResponse, Error, object>,
) => {
  return useMutation({
    mutationFn: async (data: object) =>
      parseAPIResponse<OAuthAuthorizeResponse>(await confirmUserOAuthAuthorize(data)),
    ...options,
  });
};

export const useRevokeUserOAuthApp = (options?: UseMutationOptions<unknown, Error, string>) => {
  return useMutation({
    mutationFn: async (clientId: string) => parseAPIResponse(await revokeUserOAuthApp(clientId)),
    ...options,
  });
};

export const useSendBatchEmail = (options?: UseMutationOptions<unknown, Error, object>) => {
  return useMutation({
    mutationFn: async (data: object) => parseAPIResponse(await sendBatchEmail(data)),
    ...options,
  });
};

export const useUpdateUser = (
  options?: UseMutationOptions<unknown, Error, { userId: number; data: object }>,
) => {
  return useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: object }) =>
      parseAPIResponse(await updateUser(userId, data)),
    ...options,
  });
};

export const useDeleteUser = (options?: UseMutationOptions<unknown, Error, number>) => {
  return useMutation({
    mutationFn: async (userId: number) => parseAPIResponse(await deleteUser(userId)),
    ...options,
  });
};
