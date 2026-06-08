import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_TEST } },
    });
  }
  return client;
}

export async function resetDatabase(): Promise<void> {
  await getTestPrisma().$executeRaw`
    TRUNCATE "User", "RefreshToken", "Note", "Tag", "NoteTag",
             "NoteVersion", "ShareLink", "PasswordResetOTP"
    CASCADE
  `;
}
