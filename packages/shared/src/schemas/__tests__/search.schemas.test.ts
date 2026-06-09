import { describe, it, expect } from 'vitest';
import { SearchQuerySchema } from '../search.schemas.js';

describe('SearchQuerySchema', () => {
  it('T45-a: parses valid query string', () => {
    const result = SearchQuerySchema.safeParse({ q: 'meeting notes' });
    expect(result.success).toBe(true);
  });

  it('T45-b: accepts empty query string for service-level QUERY_REQUIRED handling', () => {
    const result = SearchQuerySchema.safeParse({ q: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('');
    }
  });

  it('trims whitespace-only query string to empty string', () => {
    const result = SearchQuerySchema.safeParse({ q: '   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('');
    }
  });

  it('applies defaults for page and limit', () => {
    const result = SearchQuerySchema.safeParse({ q: 'test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('rejects limit over 100', () => {
    const result = SearchQuerySchema.safeParse({ q: 'test', limit: '200' });
    expect(result.success).toBe(false);
  });
});
