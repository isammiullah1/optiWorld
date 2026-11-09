import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginSchema>;

export const LoginFormSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Enter a valid email address'),
  password: z.string().superRefine((value, context) => {
    if (value.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Password is required' });
      return;
    }
    if (value.length < 8) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must be at least 8 characters',
      });
    }
  }),
});
export type LoginFormValues = z.infer<typeof LoginFormSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordSchema>;
