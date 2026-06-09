import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSearch } from '../../hooks/useSearch.js';
import { SearchResultCard } from '../../components/search/SearchResultCard.js';
import { Pagination } from '../../components/notes/Pagination.js';
import { Button } from '../../components/ui/button.js';

function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg border bg-white" />
      ))}
    </div>
  );
}

function SearchEmpty({ query }: { query: string }) {
  return (
    <div className="py-12 text-center text-gray-500">
      <p className="text-sm">
        No notes found for <strong>&ldquo;{query}&rdquo;</strong>.
      </p>
    </div>
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));

  const [inputValue, setInputValue] = useState(q);

  useEffect(() => {
    setInputValue(q);
  }, [q]);

  const { data, isLoading } = useSearch({ q, page, limit: 20 });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSearchParams({ q: trimmed, page: '1' });
  }

  function handlePageChange(newPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-md border bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search notes"
          />
        </div>
        <Button type="submit" size="sm">Search</Button>
      </form>

      {!q && (
        <p className="text-sm text-gray-500">Enter a search term to find your notes.</p>
      )}

      {q && isLoading && <SearchSkeleton />}

      {q && !isLoading && data?.data.length === 0 && <SearchEmpty query={q} />}

      {q && !isLoading && data && data.data.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {data.data.map((result) => (
              <SearchResultCard key={result.id} result={result} />
            ))}
          </div>
          {data.meta.totalPages > 1 && (
            <Pagination meta={data.meta} onPageChange={handlePageChange} />
          )}
        </>
      )}
    </div>
  );
}
