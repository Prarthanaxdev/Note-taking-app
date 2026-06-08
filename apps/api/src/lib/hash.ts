import bcrypt from 'bcryptjs';

const saltRounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, saltRounds);
export const comparePassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(plain, hash);
