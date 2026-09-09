import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { API_URL } from "@/utils/api/api.ts";
import { APIError } from "@/utils/errors.ts";
import { parseAPIResponse } from "@/utils/api/response.ts";

interface CaptchaAuthParams {
  values: object;
  captchaToken: string;
}

interface ResetPasswordParams {
  token: string;
  values: object;
}

async function authMutationFn<T = unknown>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseAPIResponse<T>(res);
}

export const useLogin = (
  options?: UseMutationOptions<{ token: string }, APIError, CaptchaAuthParams>,
) => {
  return useMutation({
    mutationFn: ({ values, captchaToken }: CaptchaAuthParams) =>
      authMutationFn<{ token: string }>(`${API_URL}/user/login?captcha=${captchaToken}`, values),
    ...options,
  });
};

export const useRegister = (options?: UseMutationOptions<unknown, APIError, CaptchaAuthParams>) => {
  return useMutation({
    mutationFn: ({ values, captchaToken }: CaptchaAuthParams) =>
      authMutationFn(`${API_URL}/user/register?captcha=${captchaToken}`, values),
    ...options,
  });
};

export const useForgotPassword = (
  options?: UseMutationOptions<unknown, APIError, CaptchaAuthParams>,
) => {
  return useMutation({
    mutationFn: ({ values, captchaToken }: CaptchaAuthParams) =>
      authMutationFn(`${API_URL}/user/forgot-password?captcha=${captchaToken}`, values),
    ...options,
  });
};

export const useResetPassword = (
  options?: UseMutationOptions<unknown, APIError, ResetPasswordParams>,
) => {
  return useMutation({
    mutationFn: ({ token, values }: ResetPasswordParams) =>
      authMutationFn(`${API_URL}/user/reset-password?token=${token}`, values),
    ...options,
  });
};
