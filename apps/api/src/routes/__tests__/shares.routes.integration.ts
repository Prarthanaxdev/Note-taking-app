import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getTestPrisma, resetDatabase } from '../../test/integration-setup.js';

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);

beforeAll(async () => {
  if (!DB_AVAILABLE) {
    console.warn('⚠ Skipping shares integration tests — DATABASE_URL_TEST not set');
  }
});
beforeEach(async () => { if (DB_AVAILABLE) await resetDatabase(); });
afterAll(async () => { if (DB_AVAILABLE) await getTestPrisma().$disconnect(); });

const AUTH_BASE = '/api/v1/auth';
const NOTES_BASE = '/api/v1/notes';
const SHARES_BASE = '/api/v1/shares';
const PUBLIC_BASE = '/api/v1/public';

const VALID_USER = { email: 'alice@example.com', password: 'securePassword123' };
const OTHER_USER = { email: 'bob@example.com', password: 'securePassword123' };

async function registerUser(creds = VALID_USER): Promise<{ accessToken: string; userId: string }> {
  const res = await request(app).post(`${AUTH_BASE}/register`).send(creds);
  return {
    accessToken: res.body.accessToken as string,
    userId: (await getTestPrisma().user.findUnique({ where: { email: creds.email } }))!.id,
  };
}

async function createNote(
  token: string,
  body: Record<string, unknown> = { title: 'Test Note' },
): Promise<string> {
  const res = await request(app)
    .post(NOTES_BASE)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body.id as string;
}

async function createShare(
  token: string,
  noteId: string,
  body: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app)
    .post(`${NOTES_BASE}/${noteId}/share`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body.id as string;
}

// ── POST /api/v1/notes/:id/share ──────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /api/v1/notes/:id/share', () => {
  it('SHARE-IT-01: no auth → 401', async () => {
    const res = await request(app).post(`${NOTES_BASE}/fake-id/share`).send({});
    expect(res.status).toBe(401);
  });

  it('SHARE-IT-02: note not found → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(`${NOTES_BASE}/nonexistent-id/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-03: note belongs to other user → 404', async () => {
    const alice = await registerUser(VALID_USER);
    const bob = await registerUser(OTHER_USER);
    const bobNoteId = await createNote(bob.accessToken);

    const res = await request(app)
      .post(`${NOTES_BASE}/${bobNoteId}/share`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-04: no expiresAt → 201 with ShareLink shape', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .post(`${NOTES_BASE}/${noteId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      noteId,
      token: expect.any(String),
      viewCount: 0,
      revokedAt: null,
      createdAt: expect.any(String),
    });
  });

  it('SHARE-IT-05: valid future expiresAt → 201 with expiresAt in response', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const expiresAt = '2099-06-01T00:00:00.000Z';

    const res = await request(app)
      .post(`${NOTES_BASE}/${noteId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ expiresAt });

    expect(res.status).toBe(201);
    expect(res.body.expiresAt).toBe(expiresAt);
  });

  it('SHARE-IT-06: past expiresAt → 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .post(`${NOTES_BASE}/${noteId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ expiresAt: '2000-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('SHARE-IT-07: two links for same note → both 201 with distinct tokens', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res1 = await request(app)
      .post(`${NOTES_BASE}/${noteId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    const res2 = await request(app)
      .post(`${NOTES_BASE}/${noteId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.token).not.toBe(res2.body.token);
    expect(res1.body.id).not.toBe(res2.body.id);
  });
});

// ── GET /api/v1/notes/:id/shares ──────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/:id/shares', () => {
  it('SHARE-IT-08: no auth → 401', async () => {
    const res = await request(app).get(`${NOTES_BASE}/fake-id/shares`);
    expect(res.status).toBe(401);
  });

  it('SHARE-IT-09: note not found → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/nonexistent-id/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-10: no share links → 200 empty array', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SHARE-IT-11: one active link → 200 array length 1', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await createShare(accessToken, noteId);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('SHARE-IT-12: returns all links including revoked (length 2)', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const shareId1 = await createShare(accessToken, noteId);
    await createShare(accessToken, noteId);

    // Revoke first link
    await request(app)
      .delete(`${SHARES_BASE}/${shareId1}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const revoked = res.body.find((l: { id: string }) => l.id === shareId1);
    const active = res.body.find((l: { id: string }) => l.id !== shareId1);
    expect(revoked.revokedAt).not.toBeNull();
    expect(active.revokedAt).toBeNull();
  });
});

// ── DELETE /api/v1/shares/:shareId ───────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('DELETE /api/v1/shares/:shareId', () => {
  it('SHARE-IT-13: no auth → 401', async () => {
    const res = await request(app).delete(`${SHARES_BASE}/fake-id`);
    expect(res.status).toBe(401);
  });

  it('SHARE-IT-14: link not found → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .delete(`${SHARES_BASE}/nonexistent-id`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-15: link belongs to other user → 404', async () => {
    const alice = await registerUser(VALID_USER);
    const bob = await registerUser(OTHER_USER);
    const bobNoteId = await createNote(bob.accessToken);
    const bobShareId = await createShare(bob.accessToken, bobNoteId);

    const res = await request(app)
      .delete(`${SHARES_BASE}/${bobShareId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-16: valid revoke → 204; revokedAt set in subsequent list', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const shareId = await createShare(accessToken, noteId);

    const deleteRes = await request(app)
      .delete(`${SHARES_BASE}/${shareId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const link = listRes.body.find((l: { id: string }) => l.id === shareId);
    expect(link.revokedAt).not.toBeNull();
  });
});

// ── GET /api/v1/public/notes/:token ──────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/public/notes/:token', () => {
  it('SHARE-IT-17: unknown token → 404', async () => {
    const res = await request(app).get(`${PUBLIC_BASE}/notes/nonexistent-token`);
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-18: revoked link → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const shareId = await createShare(accessToken, noteId);

    const shareRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const token = shareRes.body[0].token as string;

    await request(app)
      .delete(`${SHARES_BASE}/${shareId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app).get(`${PUBLIC_BASE}/notes/${token}`);
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-19: expired link → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    // Insert an already-expired link directly via test Prisma client
    const expiredLink = await getTestPrisma().shareLink.create({
      data: {
        noteId,
        userId: (await getTestPrisma().user.findUnique({ where: { email: VALID_USER.email } }))!.id,
        expiresAt: new Date('2000-01-01'),
      },
    });

    const res = await request(app).get(`${PUBLIC_BASE}/notes/${expiredLink.token}`);
    expect(res.status).toBe(404);
  });

  it('SHARE-IT-20: soft-deleted note → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const shareId = await createShare(accessToken, noteId);

    const shareRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const token = shareRes.body[0].token as string;

    // Soft-delete the note
    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app).get(`${PUBLIC_BASE}/notes/${token}`);
    expect(res.status).toBe(404);

    // Suppress unused variable warning
    void shareId;
  });

  it('SHARE-IT-21/23: valid active link → 200 with title+content only; no auth required', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Public Note Title' });

    const shareRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);

    // Create share link first
    await request(app)
      .post(`${NOTES_BASE}/${noteId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    const listRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const token = listRes.body[0].token as string;

    // SHARE-IT-23: no Authorization header
    const res = await request(app).get(`${PUBLIC_BASE}/notes/${token}`);

    expect(res.status).toBe(200);
    // SHARE-IT-21: only title and content
    expect(res.body).toHaveProperty('title', 'Public Note Title');
    expect(res.body).toHaveProperty('content');
    expect(res.body).not.toHaveProperty('tags');
    expect(res.body).not.toHaveProperty('userId');
    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('viewCount');
    expect(res.body).not.toHaveProperty('revokedAt');

    void shareRes;
  });

  it('SHARE-IT-22: viewCount incremented on each access', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const shareId = await createShare(accessToken, noteId);

    const shareRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const token = shareRes.body[0].token as string;

    // First access
    await request(app).get(`${PUBLIC_BASE}/notes/${token}`);
    const after1 = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const link1 = after1.body.find((l: { id: string }) => l.id === shareId);
    expect(link1.viewCount).toBe(1);

    // Second access
    await request(app).get(`${PUBLIC_BASE}/notes/${token}`);
    const after2 = await request(app)
      .get(`${NOTES_BASE}/${noteId}/shares`)
      .set('Authorization', `Bearer ${accessToken}`);
    const link2 = after2.body.find((l: { id: string }) => l.id === shareId);
    expect(link2.viewCount).toBe(2);
  });
});
