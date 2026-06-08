import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '../auth.schemas.js';

describe('RegisterSchema', () => {
  it('T42-a: parses valid email and password', () => {
    const result = RegisterSchema.safeParse({ email: 'user@example.com', password: 'password1' });
    expect(result.success).toBe(true);
  });

  it('T42-b: rejects invalid email format', () => {
    const result = RegisterSchema.safeParse({ email: 'not-an-email', password: 'password1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('email');
    }
  });

  it('T42-c: rejects password shorter than 8 characters', () => {
    const result = RegisterSchema.safeParse({ email: 'user@example.com', password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('password');
    }
  });
});

describe('LoginSchema', () => {
  it('T42-d: parses valid credentials', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'anypassword' });
    expect(result.success).toBe(true);
  });

  it('T42-e: rejects empty password', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('password');
    }
  });
});

describe('ForgotPasswordSchema', () => {
  it('T42-f: parses valid email', () => {
    const result = ForgotPasswordSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('T42-f: rejects non-email string', () => {
    const result = ForgotPasswordSchema.safeParse({ email: 'notanemail' });
    expect(result.success).toBe(false);
  });
});

describe('ResetPasswordSchema', () => {
  it('T42-g: parses valid reset payload', () => {
    const result = ResetPasswordSchema.safeParse({
      email: 'user@example.com',
      otp: '123456',
      newPassword: 'newpassword1',
    });
    expect(result.success).toBe(true);
  });

  it('T42-h: rejects OTP shorter than 6 digits', () => {
    const result = ResetPasswordSchema.safeParse({
      email: 'user@example.com',
      otp: '12345',
      newPassword: 'newpassword1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('otp');
    }
  });

  it('T42-i: rejects OTP containing non-digit characters', () => {
    const result = ResetPasswordSchema.safeParse({
      email: 'user@example.com',
      otp: '12345a',
      newPassword: 'newpassword1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('otp');
    }
  });

  it('T42-j: rejects newPassword shorter than 8 characters', () => {
    const result = ResetPasswordSchema.safeParse({
      email: 'user@example.com',
      otp: '123456',
      newPassword: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('newPassword');
    }
  });
});
