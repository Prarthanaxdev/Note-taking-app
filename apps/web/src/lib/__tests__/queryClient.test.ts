import { describe, it, expect } from 'vitest';
import { queryClient } from '../queryClient.js';

describe('queryClient configuration', () => {
  it('T51-a: staleTime is 60_000 ms', () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.staleTime).toBe(60_000);
  });

  it('T51-b: retry is 1', () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.retry).toBe(1);
  });

  it('gcTime is 300_000 ms', () => {
    const options = queryClient.getDefaultOptions();
    expect(options.queries?.gcTime).toBe(300_000);
  });
});
