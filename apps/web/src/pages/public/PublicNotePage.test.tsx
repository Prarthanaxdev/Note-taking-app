import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PublicNotePage } from './PublicNotePage.js';

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn((options: { content: unknown }) => ({ content: options.content })),
  EditorContent: ({ editor }: { editor: { content: unknown } }) => (
    <div data-testid="public-note-content">{JSON.stringify(editor.content)}</div>
  ),
}));

vi.mock('../../hooks/useShares.js', () => ({
  usePublicNote: vi.fn(() => ({
    data: {
      title: 'Shared roadmap',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Visible note body' }] }],
      },
    },
    isLoading: false,
    isError: false,
  })),
}));

describe('PublicNotePage', () => {
  it('renders the shared note title and content', () => {
    render(
      <MemoryRouter initialEntries={['/public/a108061f-90f0-4a6f-ad1e-86842f6b762a']}>
        <PublicNotePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Shared roadmap' })).toBeInTheDocument();
    expect(screen.getByTestId('public-note-content')).toHaveTextContent('Visible note body');
  });
});
