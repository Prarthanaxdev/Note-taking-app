import type { NoteListItem } from 'shared';
import { NoteCard } from './NoteCard.js';

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-white p-4 shadow-sm animate-pulse">
      <div className="h-5 w-2/3 rounded bg-gray-200" />
      <div className="h-4 w-full rounded bg-gray-100" />
      <div className="h-4 w-4/5 rounded bg-gray-100" />
      <div className="flex gap-1.5 pt-1">
        <div className="h-5 w-12 rounded-full bg-gray-200" />
        <div className="h-5 w-16 rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

interface NoteListProps {
  notes: NoteListItem[];
  isLoading: boolean;
}

export function NoteList({ notes, isLoading }: NoteListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="text-4xl">📝</div>
        <p className="text-lg font-medium text-gray-700">No notes yet</p>
        <p className="text-sm text-gray-400">Create your first note using the button in the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}
