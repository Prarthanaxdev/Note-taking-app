import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getTestPrisma, resetDatabase } from '../../test/integration-setup.js';

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);

beforeAll(async () => {
  if (!DB_AVAILABLE) {
    console.warn('⚠ Skipping tags integration tests — DATABASE_URL_TEST not set');
  }
});
beforeEach(async () => { if (DB_AVAILABLE) await resetDatabase(); });
afterAll(async () => { if (DB_AVAILABLE) await getTestPrisma().$disconnect(); });

const AUTH_BASE = '/api/v1/auth';
const TAGS_BASE = '/api/v1/tags';
const NOTES_BASE = '/api/v1/notes';

const VALID_USER = { email: 'alice@example.com', password: 'securePassword123' };
const OTHER_USER = { email: 'bob@example.com', password: 'securePassword123' };

async function registerUser(creds = VALID_USER): Promise<{ accessToken: string }> {
  const res = await request(app).post(`${AUTH_BASE}/register`).send(creds);
  return { accessToken: res.body.accessToken as string };
}

async function createTag(
  token: string,
  body: Record<string, unknown> = { name: 'test-tag' },
): Promise<string> {
  const res = await request(app)
    .post(TAGS_BASE)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body.id as string;
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

// ── GET /api/v1/tags ──────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/tags', () => {
  it('TAG-IT-01: no auth → 401', async () => {
    const res = await request(app).get(TAGS_BASE);
    expect(res.status).toBe(401);
  });

  it('TAG-IT-02: auth, no tags → 200 empty array', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TAG-IT-03: auth, one tag with attached note → response contains tag with noteCount', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'work', color: '#ff0000' });
    await createNote(accessToken, { title: 'Note', tagIds: [tagId] });

    const res = await request(app)
      .get(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: tagId,
      name: 'work',
      color: '#ff0000',
      noteCount: 1,
    });
  });

  it('TAG-IT-04: noteCount excludes soft-deleted notes', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'work' });
    const noteId = await createNote(accessToken, { title: 'Note', tagIds: [tagId] });

    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body[0].noteCount).toBe(0);
  });

  it('TAG-IT-05: cross-user isolation — Alice only sees her own tags', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    await createTag(aliceToken, { name: 'alice-tag' });
    await createTag(bobToken, { name: 'bob-tag' });

    const aliceRes = await request(app).get(TAGS_BASE).set('Authorization', `Bearer ${aliceToken}`);
    expect(aliceRes.body).toHaveLength(1);
    expect(aliceRes.body[0].name).toBe('alice-tag');
  });
});

// ── POST /api/v1/tags ─────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /api/v1/tags', () => {
  it('TAG-IT-06: no auth → 401', async () => {
    const res = await request(app).post(TAGS_BASE).send({ name: 'test' });
    expect(res.status).toBe(401);
  });

  it('TAG-IT-07: valid name and color → 201 with TagSummary shape', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'work', color: '#ff5733' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), name: 'work', color: '#ff5733' });
  });

  it('TAG-IT-08: valid name only — no color → 201 with color: null', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'personal' });

    expect(res.status).toBe(201);
    expect(res.body.color).toBeNull();
  });

  it('TAG-IT-09: missing name → 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ color: '#ff0000' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('TAG-IT-10: invalid color format → 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'test', color: 'red' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('TAG-IT-11: duplicate name same case → 409 TAG_NAME_TAKEN', async () => {
    const { accessToken } = await registerUser();
    await createTag(accessToken, { name: 'work' });

    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'work' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TAG_NAME_TAKEN');
  });

  it('TAG-IT-12: duplicate name different case ("Work" vs "work") → 409 TAG_NAME_TAKEN', async () => {
    const { accessToken } = await registerUser();
    await createTag(accessToken, { name: 'work' });

    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Work' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TAG_NAME_TAKEN');
  });

  it('TAG-IT-13: same name as another user\'s tag → 201 (tags are user-scoped)', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    await createTag(bobToken, { name: 'work' });

    const res = await request(app)
      .post(TAGS_BASE)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'work' });

    expect(res.status).toBe(201);
  });
});

// ── PATCH /api/v1/tags/:id ────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('PATCH /api/v1/tags/:id', () => {
  it('TAG-IT-14: no auth → 401', async () => {
    const res = await request(app).patch(`${TAGS_BASE}/some-id`).send({ name: 'new' });
    expect(res.status).toBe(401);
  });

  it('TAG-IT-15: update name → 200 with updated TagSummary', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'old' });

    const res = await request(app)
      .patch(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'new' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('new');
  });

  it('TAG-IT-16: update color → 200 with updated color', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'work', color: '#ff0000' });

    const res = await request(app)
      .patch(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ color: '#00ff00' });

    expect(res.status).toBe(200);
    expect(res.body.color).toBe('#00ff00');
  });

  it('TAG-IT-17: send color: null → 200 with color: null (color unset)', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'work', color: '#ff0000' });

    const res = await request(app)
      .patch(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ color: null });

    expect(res.status).toBe(200);
    expect(res.body.color).toBeNull();
  });

  it('TAG-IT-18: rename to existing name (case-insensitive conflict) → 409 TAG_NAME_TAKEN', async () => {
    const { accessToken } = await registerUser();
    await createTag(accessToken, { name: 'existing' });
    const tagId = await createTag(accessToken, { name: 'other' });

    const res = await request(app)
      .patch(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Existing' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TAG_NAME_TAKEN');
  });

  it('TAG-IT-19: rename to own name in different case → 200 (self-exclusion)', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'work' });

    const res = await request(app)
      .patch(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Work' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Work');
  });

  it('TAG-IT-20: tag belongs to different user → 404', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    const bobTagId = await createTag(bobToken, { name: 'bob-tag' });

    const res = await request(app)
      .patch(`${TAGS_BASE}/${bobTagId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'hijacked' });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/v1/tags/:id ───────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('DELETE /api/v1/tags/:id', () => {
  it('TAG-IT-21: no auth → 401', async () => {
    const res = await request(app).delete(`${TAGS_BASE}/some-id`);
    expect(res.status).toBe(401);
  });

  it('TAG-IT-22: own tag → 204 No Content', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'deletable' });

    const res = await request(app)
      .delete(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('TAG-IT-23: tag belongs to different user → 404', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    const bobTagId = await createTag(bobToken, { name: 'bob-tag' });

    const res = await request(app)
      .delete(`${TAGS_BASE}/${bobTagId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(404);
  });

  it('TAG-IT-24: after delete, note that had the tag no longer shows it', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'temporary' });
    const noteId = await createNote(accessToken, { title: 'Tagged Note', tagIds: [tagId] });

    await request(app)
      .delete(`${TAGS_BASE}/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const noteRes = await request(app)
      .get(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(noteRes.status).toBe(200);
    expect(noteRes.body.tags).toEqual([]);
  });
});
