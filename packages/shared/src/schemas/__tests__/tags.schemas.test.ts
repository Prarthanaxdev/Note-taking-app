import { describe, it, expect } from 'vitest';
import { CreateTagSchema, UpdateTagSchema } from '../tags.schemas.js';

describe('CreateTagSchema', () => {
  it('T44-a: parses valid name and hex color', () => {
    const result = CreateTagSchema.safeParse({ name: 'Work', color: '#FF5733' });
    expect(result.success).toBe(true);
  });

  it('T44-b: rejects name longer than 50 characters', () => {
    const result = CreateTagSchema.safeParse({ name: 'a'.repeat(51) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('name');
    }
  });

  it('T44-c: rejects color without # prefix', () => {
    const result = CreateTagSchema.safeParse({ name: 'Work', color: 'FF5733' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('color');
    }
  });

  it('T44-c: rejects color with invalid hex characters', () => {
    const result = CreateTagSchema.safeParse({ name: 'Work', color: '#GGGGGG' });
    expect(result.success).toBe(false);
  });

  it('T44-d: parses without color (optional)', () => {
    const result = CreateTagSchema.safeParse({ name: 'Work' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CreateTagSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('UpdateTagSchema', () => {
  it('T44-e: parses empty object (all fields optional)', () => {
    const result = UpdateTagSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('parses partial update with only name', () => {
    const result = UpdateTagSchema.safeParse({ name: 'Personal' });
    expect(result.success).toBe(true);
  });
});
