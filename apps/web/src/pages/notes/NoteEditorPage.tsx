import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Share2, History } from 'lucide-react';
import { useNote } from '../../hooks/useNotes.js';
import { NoteEditor } from '../../components/editor/NoteEditor.js';
import { SaveStatusIndicator } from '../../components/editor/SaveStatusIndicator.js';
import type { SaveStatus } from '../../components/editor/SaveStatusIndicator.js';
import { TagCombobox } from '../../components/tags/TagCombobox.js';
import { ShareModal } from '../../components/share/ShareModal.js';
import { VersionDrawer } from '../../components/versions/VersionDrawer.js';
import { Button } from '../../components/ui/button.js';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <div className="flex-1 h-7 rounded bg-gray-200" />
        <div className="h-5 w-16 rounded bg-gray-100" />
        <div className="h-7 w-28 rounded bg-gray-100" />
        <div className="h-7 w-14 rounded bg-gray-100" />
        <div className="h-7 w-16 rounded bg-gray-100" />
      </div>
      <div className="flex-1 p-4 space-y-3">
        <div className="h-4 w-3/4 rounded bg-gray-100" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
      </div>
    </div>
  );
}

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: note, isLoading, isError } = useNote(id!);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (isError) return <Navigate to="/notes" replace />;
  if (isLoading || !note) return <LoadingSkeleton />;

  const initialTitle = note.title;
  const initialTagIds = note.tags.map((t) => t.id);

  return (
    <NoteEditorPageInner
      key={note.id}
      noteId={note.id}
      initialTitle={initialTitle}
      initialContent={note.content}
      initialTagIds={initialTagIds}
      status={status}
      setStatus={setStatus}
      shareOpen={shareOpen}
      setShareOpen={setShareOpen}
      historyOpen={historyOpen}
      setHistoryOpen={setHistoryOpen}
    />
  );
}

interface InnerProps {
  noteId: string;
  initialTitle: string;
  initialContent: object | null;
  initialTagIds: string[];
  status: SaveStatus;
  setStatus: (s: SaveStatus) => void;
  shareOpen: boolean;
  setShareOpen: (v: boolean) => void;
  historyOpen: boolean;
  setHistoryOpen: (v: boolean) => void;
}

function NoteEditorPageInner({
  noteId,
  initialTitle,
  initialContent,
  initialTagIds,
  status,
  setStatus,
  shareOpen,
  setShareOpen,
  historyOpen,
  setHistoryOpen,
}: InnerProps) {
  const [title, setTitle] = useState(initialTitle);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-4 py-2 shrink-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 text-xl font-bold bg-transparent outline-none min-w-0 truncate"
          placeholder="Untitled"
          aria-label="Note title"
        />
        <SaveStatusIndicator status={status} onRetry={() => setStatus('idle')} />
        <TagCombobox selectedTagIds={tagIds} onChange={setTagIds} />
        <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5">
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <NoteEditor
          noteId={noteId}
          initialContent={initialContent}
          title={title}
          tagIds={tagIds}
          onStatusChange={setStatus}
        />
      </div>

      <ShareModal noteId={noteId} open={shareOpen} onOpenChange={setShareOpen} />
      <VersionDrawer noteId={noteId} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
