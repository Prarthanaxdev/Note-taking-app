import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { authLimiter, forgotPasswordLimiter } from '../middleware/rateLimit.middleware.js';
import { RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema } from 'shared';
import { AppError } from '../lib/errors.js';
import * as authService from '../services/auth.service.js';

export const authRouter: IRouter = Router();

const COOKIE_NAME = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7) * 24 * 60 * 60 * 1000,
};

function setRefreshCookie(res: Response, raw: string): void {
  res.cookie(COOKIE_NAME, raw, COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: COOKIE_OPTIONS.secure,
    path: '/',
  });
}

function getRefreshTokenFromRequest(req: Request): string | undefined {
  const header = req.headers.cookie ?? '';
  const match = header.match(/(?:^|;\s*)refreshToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

authRouter.post(
  '/register',
  authLimiter,
  validate(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const { accessToken, rawRefreshToken } = await authService.register(email, password);
      setRefreshCookie(res, rawRefreshToken);
      res.status(201).json({ accessToken });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/login',
  authLimiter,
  validate(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const { accessToken, rawRefreshToken } = await authService.login(email, password);
      setRefreshCookie(res, rawRefreshToken);
      res.status(200).json({ accessToken });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = getRefreshTokenFromRequest(req);
      if (!rawToken) {
        next(new AppError('REFRESH_TOKEN_INVALID', 'Your session has expired. Please log in again.', 401));
        return;
      }
      const { accessToken, rawRefreshToken } = await authService.refreshTokens(rawToken);
      setRefreshCookie(res, rawRefreshToken);
      res.status(200).json({ accessToken });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = getRefreshTokenFromRequest(req);
      await authService.logout(rawToken);
      clearRefreshCookie(res);
      res.status(200).json({ message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(ForgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email: string };
      await authService.forgotPassword(email);
      res.status(200).json({ message: 'If registered, an OTP has been sent.' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/reset-password',
  validate(ResetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, otp, newPassword } = req.body as {
        email: string;
        otp: string;
        newPassword: string;
      };
      await authService.resetPassword(email, otp, newPassword);
      res.status(200).json({ message: 'Password updated.' });
    } catch (err) {
      next(err);
    }
  },
);
