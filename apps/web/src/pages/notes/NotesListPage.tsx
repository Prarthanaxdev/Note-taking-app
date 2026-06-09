import { useSearchParams } from 'react-router-dom';
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

  const notes = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="flex gap-6">
      <aside className="hidden w-52 shrink-0 lg:block">
        <TagFilter
          tags={allTags}
          selectedTagIds={selectedTagIds}
          onToggle={handleTagToggle}
        />
      </aside>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">My Notes</h1>
          <SortControl
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortByChange={handleSortByChange}
            onSortOrderChange={handleSortOrderChange}
          />
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
