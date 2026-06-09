import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { NoteListItem } from 'shared';
import { formatRelativeTime } from '../../lib/utils.js';
import { useDeleteNote } from '../../hooks/useNotes.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js';

interface NoteCardProps {
  note: NoteListItem;
}

export function NoteCard({ note }: NoteCardProps) {
  const navigate = useNavigate();
  const deleteNote = useDeleteNote();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmOpen(true);
  }

  function confirmDelete() {
    deleteNote.mutate(note.id, { onSuccess: () => setConfirmOpen(false) });
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/notes/${note.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/notes/${note.id}`)}
        className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 flex-1 font-semibold text-gray-900">
            {note.title || 'Untitled'}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            aria-label="Delete note"
            className="h-7 w-7 shrink-0 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
          </Button>
        </div>

        {note.contentPreview && (
          <p className="line-clamp-2 text-sm text-gray-500">{note.contentPreview}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {note.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="text-xs"
              style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color } : undefined}
            >
              {tag.name}
            </Badge>
          ))}
          <span className="ml-auto shrink-0 text-xs text-gray-400">
            {formatRelativeTime(note.updatedAt)}
          </span>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete note?</DialogTitle>
            <DialogDescription>
              &ldquo;{note.title || 'Untitled'}&rdquo; will be moved to trash. You can restore it
              within 30 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteNote.isPending}
            >
              {deleteNote.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
