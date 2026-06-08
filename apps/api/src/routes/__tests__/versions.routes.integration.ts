import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getTestPrisma, resetDatabase } from '../../test/integration-setup.js';

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);

beforeAll(async () => {
  if (!DB_AVAILABLE) {
    console.warn('⚠ Skipping versions integration tests — DATABASE_URL_TEST not set');
  }
});
beforeEach(async () => { if (DB_AVAILABLE) await resetDatabase(); });
afterAll(async () => { if (DB_AVAILABLE) await getTestPrisma().$disconnect(); });

const AUTH_BASE = '/api/v1/auth';
const NOTES_BASE = '/api/v1/notes';

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

async function patchNote(
  token: string,
  noteId: string,
  body: Record<string, unknown> = { title: 'Updated Title' },
): Promise<void> {
  await request(app)
    .patch(`${NOTES_BASE}/${noteId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

// ── GET /api/v1/notes/:id/versions ───────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/:id/versions', () => {
  it('VER-IT-01: no auth → 401', async () => {
    const res = await request(app).get(`${NOTES_BASE}/fake-id/versions`);
    expect(res.status).toBe(401);
  });

  it('VER-IT-02: note not found → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/nonexistent-id/versions`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-03: note belongs to other user → 404', async () => {
    const alice = await registerUser(VALID_USER);
    const bob = await registerUser(OTHER_USER);
    const bobNoteId = await createNote(bob.accessToken);

    const res = await request(app)
      .get(`${NOTES_BASE}/${bobNoteId}/versions`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-04: no versions yet → 200 empty array', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('VER-IT-05: one version → 200 [{ id, savedAt }] with no extra fields', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Original' });
    await patchNote(accessToken, noteId, { title: 'Updated' });

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const item = res.body[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('savedAt');
    expect(item).not.toHaveProperty('title');
    expect(item).not.toHaveProperty('content');
    expect(typeof item.savedAt).toBe('string');
  });
});

// ── GET /api/v1/notes/:id/versions/:versionId ─────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/:id/versions/:versionId', () => {
  it('VER-IT-06: no auth → 401', async () => {
    const res = await request(app).get(`${NOTES_BASE}/fake-id/versions/fake-vid`);
    expect(res.status).toBe(401);
  });

  it('VER-IT-07: note not found → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/nonexistent-id/versions/fake-vid`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-08: note belongs to other user → 404', async () => {
    const alice = await registerUser(VALID_USER);
    const bob = await registerUser(OTHER_USER);
    const bobNoteId = await createNote(bob.accessToken);
    await patchNote(bob.accessToken, bobNoteId);

    const versionsRes = await request(app)
      .get(`${NOTES_BASE}/${bobNoteId}/versions`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    const versionId = versionsRes.body[0]?.id as string;

    const res = await request(app)
      .get(`${NOTES_BASE}/${bobNoteId}/versions/${versionId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-09: version not found under note → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions/nonexistent-vid`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-10: valid → 200 { id, title, content, savedAt }', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Original Title' });
    await patchNote(accessToken, noteId, { title: 'Edited Title' });

    const listRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);
    const versionId = listRes.body[0].id as string;

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions/${versionId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: versionId,
      title: 'Original Title',
      savedAt: expect.any(String),
    });
    expect(res.body).toHaveProperty('content');
  });
});

// ── POST /api/v1/notes/:id/versions/:versionId/restore ────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /api/v1/notes/:id/versions/:versionId/restore', () => {
  it('VER-IT-11: no auth → 401', async () => {
    const res = await request(app).post(`${NOTES_BASE}/fake-id/versions/fake-vid/restore`);
    expect(res.status).toBe(401);
  });

  it('VER-IT-12: note not found → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(`${NOTES_BASE}/nonexistent-id/versions/fake-vid/restore`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-13: note belongs to other user → 404', async () => {
    const alice = await registerUser(VALID_USER);
    const bob = await registerUser(OTHER_USER);
    const bobNoteId = await createNote(bob.accessToken);
    await patchNote(bob.accessToken, bobNoteId);

    const versionsRes = await request(app)
      .get(`${NOTES_BASE}/${bobNoteId}/versions`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    const versionId = versionsRes.body[0]?.id as string;

    const res = await request(app)
      .post(`${NOTES_BASE}/${bobNoteId}/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-14: version not found → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .post(`${NOTES_BASE}/${noteId}/versions/nonexistent-vid/restore`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('VER-IT-15: valid restore → 200 NoteDetail with restored title; new snapshot in list', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Original Title' });
    await patchNote(accessToken, noteId, { title: 'Edited Title' });

    const listBefore = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);
    const versionsBefore = listBefore.body.length as number;
    const versionId = listBefore.body[0].id as string; // newest = snapshot of 'Original Title'

    const res = await request(app)
      .post(`${NOTES_BASE}/${noteId}/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    // Response is full NoteDetail
    expect(res.body).toMatchObject({
      id: noteId,
      title: 'Original Title',
      tags: expect.any(Array),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body).toHaveProperty('content');

    // Restore itself created a new snapshot → list grows by 1
    const listAfter = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listAfter.body.length).toBe(versionsBefore + 1);
  });

  it('VER-IT-16: auto-purge keeps version count ≤ 50 after restore', async () => {
    const { accessToken, userId } = await registerUser();
    const noteId = await createNote(accessToken);

    // Insert 50 version snapshots directly to avoid 50 API calls
    await getTestPrisma().noteVersion.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        noteId,
        title: `Version ${i + 1}`,
        savedAt: new Date(Date.now() - (50 - i) * 1000),
      })),
    });

    // Verify 50 versions exist
    const listBefore = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listBefore.body).toHaveLength(50);

    const versionId = listBefore.body[listBefore.body.length - 1].id as string;

    const res = await request(app)
      .post(`${NOTES_BASE}/${noteId}/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    // After restore: snapshot of current note (before restore) + new restore snapshot = +1
    // but auto-purge trims back to 50
    const listAfter = await request(app)
      .get(`${NOTES_BASE}/${noteId}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listAfter.body.length).toBe(50);

    // Suppress unused variable lint warning
    void userId;
  });
});
