import { FileText } from 'lucide-react';
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
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center text-muted-foreground">
        <FileText className="mb-3 h-10 w-10 opacity-30" />
        <p className="font-medium">No notes yet</p>
        <p className="mt-1 text-sm">Create your first note using the button in the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}
