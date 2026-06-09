import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./hooks/useTokenRefresh.js', () => ({
  useTokenRefresh: vi.fn(),
}));

vi.mock('./pages/public/PublicNotePage.js', () => ({
  PublicNotePage: () => <div>Rendered PublicNotePage</div>,
}));

describe('App routes', () => {
  it('renders PublicNotePage for shared note URLs', () => {
    render(
      <MemoryRouter initialEntries={['/public/a108061f-90f0-4a6f-ad1e-86842f6b762a']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Rendered PublicNotePage')).toBeInTheDocument();
    expect(screen.queryByText('TODO: PublicNotePage')).not.toBeInTheDocument();
  });
});
