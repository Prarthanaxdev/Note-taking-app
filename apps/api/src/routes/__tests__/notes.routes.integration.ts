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

async function createTag(
  token: string,
  body: Record<string, unknown> = { name: 'test-tag' },
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/tags')
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

// ── GET /api/v1/notes ─────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes', () => {
  it('LIST-IT-01: no auth header → 401', async () => {
    const res = await request(app).get(NOTES_BASE);
    expect(res.status).toBe(401);
  });

  it('LIST-IT-02: auth, no notes → 200 with empty data and zero meta', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it('LIST-IT-03: one note → 200 with correct NoteListItem shape', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Hello' });

    const res = await request(app)
      .get(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: noteId,
      title: 'Hello',
      contentPreview: expect.any(String),
      tags: [],
      updatedAt: expect.any(String),
    });
  });

  it('LIST-IT-04: note with long content → contentPreview truncated to 150 chars', async () => {
    const { accessToken } = await registerUser();
    const longText = 'a'.repeat(200);
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }] };
    await createNote(accessToken, { title: 'Long', content });

    const res = await request(app)
      .get(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].contentPreview).toHaveLength(150);
  });

  it('LIST-IT-05: two users — each sees only own notes', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    await createNote(aliceToken, { title: 'Alice Note' });
    await createNote(bobToken, { title: 'Bob Note' });

    const aliceRes = await request(app).get(NOTES_BASE).set('Authorization', `Bearer ${aliceToken}`);
    const bobRes = await request(app).get(NOTES_BASE).set('Authorization', `Bearer ${bobToken}`);

    expect(aliceRes.body.data).toHaveLength(1);
    expect(aliceRes.body.data[0].title).toBe('Alice Note');
    expect(bobRes.body.data).toHaveLength(1);
    expect(bobRes.body.data[0].title).toBe('Bob Note');
  });

  it('LIST-IT-06: limit=1 with 2 notes → meta.total=2, meta.totalPages=2, data.length=1', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'Note 1' });
    await createNote(accessToken, { title: 'Note 2' });

    const res = await request(app)
      .get(`${NOTES_BASE}?limit=1`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, totalPages: 2, limit: 1 });
  });

  it('LIST-IT-07: page=2&limit=1 with 2 notes → returns second note (older)', async () => {
    const { accessToken } = await registerUser();
    const noteId1 = await createNote(accessToken, { title: 'First Created' });
    await createNote(accessToken, { title: 'Second Created' });

    // default sortOrder=desc by updatedAt → page1=[Second], page2=[First]
    const res = await request(app)
      .get(`${NOTES_BASE}?page=2&limit=1`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(noteId1);
  });

  it('LIST-IT-08: page=99 (out of range) → 200, data=[], correct meta.total', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken);
    await createNote(accessToken);

    const res = await request(app)
      .get(`${NOTES_BASE}?page=99`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(2);
  });

  it('LIST-IT-09: sortBy=title&sortOrder=asc → data sorted alphabetically', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'Zebra' });
    await createNote(accessToken, { title: 'Apple' });

    const res = await request(app)
      .get(`${NOTES_BASE}?sortBy=title&sortOrder=asc`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].title).toBe('Apple');
    expect(res.body.data[1].title).toBe('Zebra');
  });

  it('LIST-IT-10: tags=id1 filter → only tagged note returned', async () => {
    const { accessToken } = await registerUser();
    const tagId = await createTag(accessToken, { name: 'work' });
    const taggedNoteId = await createNote(accessToken, { title: 'Tagged', tagIds: [tagId] });
    await createNote(accessToken, { title: 'Untagged' });

    const res = await request(app)
      .get(`${NOTES_BASE}?tags=${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(taggedNoteId);
  });

  it('LIST-IT-11: tags=id1,id2 AND filter → only note with both tags returned', async () => {
    const { accessToken } = await registerUser();
    const tag1 = await createTag(accessToken, { name: 'tag1' });
    const tag2 = await createTag(accessToken, { name: 'tag2' });
    const bothTagsNoteId = await createNote(accessToken, { title: 'Both Tags', tagIds: [tag1, tag2] });
    await createNote(accessToken, { title: 'One Tag Only', tagIds: [tag1] });

    const res = await request(app)
      .get(`${NOTES_BASE}?tags=${tag1},${tag2}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(bothTagsNoteId);
  });

  it('LIST-IT-12: tags= contains foreign tag → 400 INVALID_TAG', async () => {
    const { accessToken: aliceToken } = await registerUser(VALID_USER);
    const { accessToken: bobToken } = await registerUser(OTHER_USER);
    const bobTagId = await createTag(bobToken, { name: 'bob-only' });

    const res = await request(app)
      .get(`${NOTES_BASE}?tags=${bobTagId}`)
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TAG');
  });

  it('LIST-IT-13: limit=101 → 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}?limit=101`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('LIST-IT-14: soft-deleted note excluded — meta.total reflects only live notes', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'Live Note' });
    const deletedId = await createNote(accessToken, { title: 'Deleted Note' });
    await request(app)
      .delete(`${NOTES_BASE}/${deletedId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(NOTES_BASE)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].title).toBe('Live Note');
  });
});

// ── GET /api/v1/notes/search ──────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/search', () => {
  it('SRCH-IT-01: no auth header → 401', async () => {
    const res = await request(app).get(`${NOTES_BASE}/search?q=test`);
    expect(res.status).toBe(401);
  });

  it('SRCH-IT-02: missing q param → 400 VALIDATION_ERROR', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/search`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('SRCH-IT-03: whitespace-only q → 400 QUERY_REQUIRED', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=%20%20`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUERY_REQUIRED');
  });

  it('SRCH-IT-04: valid query, no matching notes → 200 empty', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=xyzzyunmatchable99`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('SRCH-IT-05: query matches note title → 200 with correct result', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'PostgreSQL indexing guide' });

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=indexing`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(noteId);
    expect(res.body.data[0].title).toBe('PostgreSQL indexing guide');
  });

  it('SRCH-IT-06: query matches note contentText → 200 with result', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'Searchable content note xyzuniquetoken' });

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=xyzuniquetoken`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('SRCH-IT-07: matching result headline contains <mark> tags', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'Guide to fulltext search features' });

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=fulltext`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].headline).toContain('<mark>');
  });

  it('SRCH-IT-08: soft-deleted note excluded from results', async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken, { title: 'Deletable softdelete testnote' });

    await request(app)
      .delete(`${NOTES_BASE}/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=softdelete`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('SRCH-IT-09: cross-user isolation — Alice cannot see Bob\'s notes', async () => {
    const alice = await registerUser(VALID_USER);
    const bob = await registerUser(OTHER_USER);

    await createNote(bob.accessToken, { title: 'Bob secret crossusertest note' });

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=crossusertest`)
      .set('Authorization', `Bearer ${alice.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('SRCH-IT-10: pagination page=1&limit=1 when 2 notes match', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'Pagination alpha pagintoken' });
    await createNote(accessToken, { title: 'Pagination beta pagintoken' });

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=pagintoken&page=1&limit=1`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.totalPages).toBe(2);
  });

  it('SRCH-IT-11: updatedAt in response is ISO 8601 string', async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, { title: 'ISO date check isotimetest' });

    const res = await request(app)
      .get(`${NOTES_BASE}/search?q=isotimetest`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
