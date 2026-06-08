import jwt from 'jsonwebtoken';
import { AppError } from './errors.js';

export function signAccessToken(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ sub: userId, email }, secret, { expiresIn });
}

export function verifyAccessToken(token: string): { id: string; email: string } {
  const secret = process.env.JWT_SECRET!;
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    return { id: payload.sub as string, email: payload.email as string };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
  }
}
