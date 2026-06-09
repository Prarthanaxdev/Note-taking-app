import { useNavigate } from 'react-router-dom';
import type { SearchResult } from 'shared';
import { formatRelativeTime } from '../../lib/utils.js';

interface SearchResultCardProps {
  result: SearchResult;
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/notes/${result.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/notes/${result.id}`)}
      className="flex cursor-pointer flex-col gap-1 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <h3 className="line-clamp-1 font-semibold text-gray-900">
        {result.title || 'Untitled'}
      </h3>
      <p
        className="line-clamp-3 text-sm text-gray-600 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5"
        dangerouslySetInnerHTML={{ __html: result.headline }}
      />
      <span className="text-xs text-gray-400">{formatRelativeTime(result.updatedAt)}</span>
    </div>
  );
}
