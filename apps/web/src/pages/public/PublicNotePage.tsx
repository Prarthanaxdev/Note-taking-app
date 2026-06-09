import { Link, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { PenLine } from 'lucide-react';
import { usePublicNote } from '../../hooks/useShares.js';

function PublicNoteSkeleton() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-10">
      <div className="h-8 w-2/3 animate-pulse rounded bg-gray-200" />
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="space-y-3">
          <div className="h-4 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function ReadOnlyNote({ content }: { content: object | null }) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: content ?? '',
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none',
      },
    },
  });

  return <EditorContent editor={editor} />;
}

export function PublicNotePage() {
  const { token } = useParams<{ token: string }>();
  const { data: note, isLoading, isError } = usePublicNote(token);

  if (isLoading) return <PublicNoteSkeleton />;

  if (isError || !note) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page-bg px-4">
        <section className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-950">Shared note unavailable</h1>
          <p className="mt-2 text-sm text-gray-500">
            This link may be expired, revoked, or the note may have been deleted.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to NoteApp
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page-bg">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4 text-primary">
          <PenLine className="h-5 w-5" />
          <span className="font-semibold">NoteApp</span>
          <span className="ml-auto text-xs font-medium uppercase tracking-wide text-gray-400">
            Shared note
          </span>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-3xl font-bold tracking-tight text-gray-950">
            {note.title || 'Untitled'}
          </h1>
          <ReadOnlyNote content={note.content} />
        </div>
      </article>
    </main>
  );
}
