import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(120);
const email = z.string().trim().toLowerCase().email("Invalid email");
const phone = z.string().trim().min(5, "Phone is too short").max(30);
const password = z.string().min(6, "Password must be at least 6 characters").max(128);

const device = {
  deviceId: z.string().min(1, "deviceId is required").max(128),
  deviceName: z.string().max(120).optional(),
  platform: z.string().max(30).optional(),
  appVersion: z.string().max(30).optional(),
};

export const registerSchema = z.object({
  name,
  email,
  phone,
  password,
  ...device,
});

export const loginSchema = z.object({
  email,
  password,
  ...device,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
  deviceId: z.string().min(1).max(128),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "token is required"),
  password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;