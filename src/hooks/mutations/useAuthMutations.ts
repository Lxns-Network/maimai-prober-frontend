import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { API_URL } from "@/utils/api/api.ts";
import { APIError } from "@/utils/errors.ts";

interface LoginParams {
  values: object;
  captchaToken: string;
}

interface RegisterParams {
  values: object;
  captchaToken: string;
}

interface ForgotPasswordParams {
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
  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new APIError("服务器返回了无效的响应", { status: res.status });
  }
  if (!data.success) {
    throw new APIError(data.message as string, { code: data.code as number, status: res.status });
  }
  return data.data as T;
}

export const useLogin = (options?: UseMutationOptions<{ token: string }, APIError, LoginParams>) => {
  return useMutation({
    mutationFn: ({ values, captchaToken }: LoginParams) =>
      authMutationFn<{ token: string }>(`${API_URL}/user/login?captcha=${captchaToken}`, values),
    ...options,
  });
};

export const useRegister = (options?: UseMutationOptions<unknown, APIError, RegisterParams>) => {
  return useMutation({
    mutationFn: ({ values, captchaToken }: RegisterParams) =>
      authMutationFn(`${API_URL}/user/register?captcha=${captchaToken}`, values),
    ...options,
  });
};

export const useForgotPassword = (options?: UseMutationOptions<unknown, APIError, ForgotPasswordParams>) => {
  return useMutation({
    mutationFn: ({ values, captchaToken }: ForgotPasswordParams) =>
      authMutationFn(`${API_URL}/user/forgot-password?captcha=${captchaToken}`, values),
    ...options,
  });
};

export const useResetPassword = (options?: UseMutationOptions<unknown, APIError, ResetPasswordParams>) => {
  return useMutation({
    mutationFn: ({ token, values }: ResetPasswordParams) =>
      authMutationFn(`${API_URL}/user/reset-password?token=${token}`, values),
    ...options,
  });
};
