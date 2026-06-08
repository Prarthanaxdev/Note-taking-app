import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getTestPrisma, resetDatabase } from '../../test/integration-setup.js';

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);

beforeAll(async () => {
  if (!DB_AVAILABLE) {
    console.warn('⚠ Skipping notes integration tests — DATABASE_URL_TEST not set');
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

// ── POST /api/v1/notes ────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /api/v1/notes', () => {
  it('NOTE-IT-01: no auth header → 401', async () => {
    const res = await request(app).post(NOTES_BASE).send({ title: 'Test' });
    expect(res.status).toBe(401);
  });

  it('NOTE-IT-02: valid request no tags → 201 with NoteDetail shape', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'My First Note' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      title: 'My First Note',
      content: null,
      tags: [],
      shareLinksCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('NOTE-IT-03: valid request with owned tag → 201; tags contains TagSummary', async () => {
    const { accessToken } = await registerUser();
    const tagRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'work', color: '#ff0000' });
    const tagId = tagRes.body.id as string;

    const res = await request(app)
      .post(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Tagged Note', tagIds: [tagId] });

    expect(res.status).toBe(201);
    expect(res.body.tags).toHaveLength(1);
    expect(res.body.tags[0]).toMatchObject({ id: tagId, name: 'work', color: '#ff0000' });
  });

  it('NOTE-IT-04: missing title → 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: { type: 'doc', content: [] } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('NOTE-IT-05: tagId from different user → 400 INVALID_TAG', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);

    const tagRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'bob-tag' });
    const bobTagId = tagRes.body.id as string;

    const res = await request(app)
      .post(NOTES_BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Alice Note', tagIds: [bobTagId] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TAG');
  });

  it('NOTE-IT-06: after create → ts column is non-null in DB', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'FTS Test', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }] } });

    const rows = await getTestPrisma().$queryRaw<Array<{ ts: string | null }>>`
      SELECT ts::text FROM "Note" WHERE id = ${noteId}
    `;
    expect(rows[0]?.ts).not.toBeNull();
  });
});

// ── GET /api/v1/notes/:id ─────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/:id', () => {
  it('NOTE-IT-07: no auth header → 401', async () => {
    const res = await request(app).get(`${NOTES_BASE}/some-id`);
    expect(res.status).toBe(401);
  });

  it('NOTE-IT-08: own note → 200 with NoteDetail shape', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: noteId,
      title: 'Test Note',
      shareLinksCount: 0,
    });
  });

  it('NOTE-IT-09: note belongs to different user → 404', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    const noteId = await createNote(bobToken);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(404);
  });

  it('NOTE-IT-10: soft-deleted note → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it('NOTE-IT-11: non-existent ID → 404', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/nonexistentid000`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/v1/notes/:id ───────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('PATCH /api/v1/notes/:id', () => {
  it('NOTE-IT-12: no auth header → 401', async () => {
    const res = await request(app).patch(`${NOTES_BASE}/some-id`).send({ title: 'New' });
    expect(res.status).toBe(401);
  });

  it('NOTE-IT-13: update title → 200; response shows updated title', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Original' });

    const res = await request(app)
      .patch(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
  });

  it('NOTE-IT-14: update content → contentText regenerated in DB', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Content Test' });

    await request(app)
      .patch(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new content text' }] }] } });

    const note = await getTestPrisma().note.findUnique({ where: { id: noteId } });
    expect(note?.contentText).toContain('new content text');
  });

  it('NOTE-IT-15: note belongs to different user → 404', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    const noteId = await createNote(bobToken);

    const res = await request(app)
      .patch(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(404);
  });

  it('NOTE-IT-16: after PATCH → NoteVersion record exists in DB', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Versioned' });

    await request(app)
      .patch(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Versioned v2' });

    const count = await getTestPrisma().noteVersion.count({ where: { noteId } });
    expect(count).toBe(1);
  });

  it('NOTE-IT-17: PATCH with new tagIds → response tags reflect new set', async () => {
    const { accessToken } = await registerUser();
    const tagRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'new-tag' });
    const tagId = tagRes.body.id as string;
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .patch(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tagIds: [tagId] });

    expect(res.status).toBe(200);
    expect(res.body.tags).toHaveLength(1);
    expect(res.body.tags[0].id).toBe(tagId);
  });

  it('NOTE-IT-18: PATCH with tagIds: [] → response has empty tags array', async () => {
    const { accessToken } = await registerUser();
    const tagRes = await request(app)
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'removable' });
    const tagId = tagRes.body.id as string;
    const noteId = await createNote(accessToken, { title: 'Tagged', tagIds: [tagId] });

    const res = await request(app)
      .patch(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tagIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual([]);
  });
});

// ── DELETE /api/v1/notes/:id ──────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('DELETE /api/v1/notes/:id', () => {
  it('NOTE-IT-19: no auth header → 401', async () => {
    const res = await request(app).delete(`${NOTES_BASE}/some-id`);
    expect(res.status).toBe(401);
  });

  it('NOTE-IT-20: own note → 204 No Content with empty body', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const res = await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('NOTE-IT-21: note belongs to different user → 404', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    const noteId = await createNote(bobToken);

    const res = await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(404);
  });

  it('NOTE-IT-22: after DELETE, GET same note → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it('NOTE-IT-23: physical row retained after soft delete — deletedAt is set', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const note = await getTestPrisma().note.findUnique({ where: { id: noteId } });
    expect(note).not.toBeNull();
    expect(note!.deletedAt).not.toBeNull();
  });

  it('NOTE-IT-24: DELETE already-soft-deleted note → 404', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});
