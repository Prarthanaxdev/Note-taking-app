import { describe, it, expect } from 'vitest';
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema } from '../notes.schemas.js';

const VALID_CUID = 'clh3rjx2p0000qzrm8c7d8v4a';

describe('CreateNoteSchema', () => {
  it('T43-a: parses valid note with title, content, and tagIds', () => {
    const result = CreateNoteSchema.safeParse({
      title: 'My Note',
      content: { type: 'doc', content: [] },
      tagIds: [VALID_CUID],
    });
    expect(result.success).toBe(true);
  });

  it('T43-b: rejects empty title', () => {
    const result = CreateNoteSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title');
    }
  });

  it('T43-c: rejects title longer than 255 characters', () => {
    const result = CreateNoteSchema.safeParse({ title: 'a'.repeat(256) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title');
    }
  });

  it('T43-d: rejects more than 5 tagIds', () => {
    const result = CreateNoteSchema.safeParse({
      title: 'My Note',
      tagIds: Array(6).fill(VALID_CUID),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('tagIds');
    }
  });

  it('T43-e: parses note without content or tagIds (both optional)', () => {
    const result = CreateNoteSchema.safeParse({ title: 'Just a title' });
    expect(result.success).toBe(true);
  });
});

describe('UpdateNoteSchema', () => {
  it('T43-f: parses empty object (all fields optional)', () => {
    const result = UpdateNoteSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('parses partial update with only title', () => {
    const result = UpdateNoteSchema.safeParse({ title: 'Updated' });
    expect(result.success).toBe(true);
  });
});

describe('NoteListQuerySchema', () => {
  it('T43-g: applies defaults when no input given', () => {
    const result = NoteListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.sortBy).toBe('updatedAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('T43-h: rejects limit greater than 100', () => {
    const result = NoteListQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('limit');
    }
  });

  it('T43-i: rejects invalid sortBy value', () => {
    const result = NoteListQuerySchema.safeParse({ sortBy: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('sortBy');
    }
  });

  it('coerces string page and limit to numbers', () => {
    const result = NoteListQuerySchema.safeParse({ page: '2', limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });
});
