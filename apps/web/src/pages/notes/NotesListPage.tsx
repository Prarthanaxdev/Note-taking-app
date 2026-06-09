import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { SortBy, SortOrder } from '../../hooks/useNotes.js';
import { useNotes } from '../../hooks/useNotes.js';
import { useTags } from '../../hooks/useTags.js';
import { NoteList } from '../../components/notes/NoteList.js';
import { Pagination } from '../../components/notes/Pagination.js';
import { SortControl } from '../../components/notes/SortControl.js';
import { TagFilter } from '../../components/notes/TagFilter.js';
import { Separator } from '../../components/ui/separator.js';

const LIMIT = 20;

function parseTagIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').filter(Boolean);
}

export function NotesListPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page') ?? 1));
  const sortBy = (params.get('sortBy') as SortBy) || 'updatedAt';
  const sortOrder = (params.get('sortOrder') as SortOrder) || 'desc';
  const tagsParam = params.get('tags') ?? '';
  const selectedTagIds = parseTagIds(tagsParam);

  const { data, isLoading } = useNotes({
    page,
    limit: LIMIT,
    sortBy,
    sortOrder,
    tags: tagsParam || undefined,
  });

  const { data: allTags = [] } = useTags();

  function setParam(key: string, value: string | null) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }

  function handleSortByChange(value: SortBy) {
    setParam('sortBy', value);
  }

  function handleSortOrderChange(value: SortOrder) {
    setParam('sortOrder', value);
  }

  function handleTagToggle(id: string) {
    const next = selectedTagIds.includes(id)
      ? selectedTagIds.filter((t) => t !== id)
      : [...selectedTagIds, id];
    setParam('tags', next.join(','));
  }

  function handlePageChange(newPage: number) {
    setParam('page', String(newPage));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const notes = data?.data ?? [];
  const meta = data?.meta;
  const showTagFilter = allTags.length > 0;

  return (
    <div className="flex min-w-0 gap-4">
      {showTagFilter && (
        <aside className="hidden w-44 shrink-0 lg:block">
          <TagFilter
            tags={allTags}
            selectedTagIds={selectedTagIds}
            onToggle={handleTagToggle}
          />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <h1 className="shrink-0 text-xl font-bold text-foreground">My Notes</h1>
          <form onSubmit={handleSearchSubmit} className="relative w-full max-w-xl xl:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full rounded-md border bg-white py-1.5 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Search notes"
            />
          </form>
          <div className="xl:ml-auto">
            <SortControl
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortByChange={handleSortByChange}
              onSortOrderChange={handleSortOrderChange}
            />
          </div>
        </div>

        <Separator />

        <NoteList notes={notes} isLoading={isLoading} />

        {meta && meta.totalPages > 1 && (
          <Pagination meta={meta} onPageChange={handlePageChange} />
        )}
      </div>
    </div>
  );
}
