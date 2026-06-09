import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useCreateNote, useUpdateNote } from '../../hooks/useNotes.js';
import { EditorToolbar } from './EditorToolbar.js';
import type { SaveStatus } from './SaveStatusIndicator.js';

interface NoteEditorProps {
  noteId?: string;
  initialContent: object | null;
  title: string;
  tagIds: string[];
  onStatusChange: (s: SaveStatus) => void;
  onCreated?: (noteId: string) => void;
}

function serializeContent(content: object | null) {
  return JSON.stringify(content ?? null);
}

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const current = node as Record<string, unknown>;
  if (current.type === 'text' && typeof current.text === 'string') return current.text;
  if (!Array.isArray(current.content)) return '';
  return current.content.map(extractText).join(' ');
}

function hasUserText(title: string, contentText: string) {
  const trimmedTitle = title.trim();
  return (trimmedTitle.length > 0 && trimmedTitle !== 'Untitled') || contentText.trim().length > 0;
}

export function NoteEditor({
  noteId,
  initialContent,
  title,
  tagIds,
  onStatusChange,
  onCreated,
}: NoteEditorProps) {
  const { mutate: createNote } = useCreateNote();
  const { mutate: updateNote } = useUpdateNote();

  const [contentSnapshot, setContentSnapshot] = useState(
    () => serializeContent(initialContent)
  );
  const [contentTextSnapshot, setContentTextSnapshot] = useState(
    () => extractText(initialContent).trim()
  );

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: initialContent ?? '',
    onUpdate: ({ editor: e }) => {
      setContentSnapshot(JSON.stringify(e.getJSON()));
      setContentTextSnapshot(e.getText().trim());
    },
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-full p-4 prose-headings:text-foreground',
      },
    },
  });

  const savedTitleRef = useRef(title);
  const savedContentRef = useRef(serializeContent(initialContent));
  const savedTagIdsRef = useRef(tagIds.slice().sort().join(','));

  const isDirty =
    title !== savedTitleRef.current ||
    contentSnapshot !== savedContentRef.current ||
    tagIds.slice().sort().join(',') !== savedTagIdsRef.current;

  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isDirty) return;
    if (!hasUserText(title, contentTextSnapshot)) return;

    const timer = setTimeout(() => {
      onStatusChange('saving');
      setHasError(false);

      const payload = {
        title: title.trim() || 'Untitled',
        content: editor?.getJSON() ?? null,
        tagIds,
      };

      const callbacks = {
        onSuccess: (note: { id: string; title: string; content: object | null; tags: { id: string }[] }) => {
          savedTitleRef.current = note.title;
          savedContentRef.current = serializeContent(note.content);
          savedTagIdsRef.current = note.tags.map((t) => t.id).sort().join(',');
          onStatusChange('saved');
          setHasError(false);
          if (!noteId) onCreated?.(note.id);
        },
        onError: () => {
          onStatusChange('error');
          setHasError(true);
        },
      };

      if (noteId) {
        updateNote({ id: noteId, ...payload }, callbacks);
      } else {
        createNote(payload, callbacks);
      }
    }, 2000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, contentSnapshot, contentTextSnapshot, tagIds.join(',')]);

  useEffect(() => {
    if (!hasError) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasError]);

  return (
    <div className="flex flex-col h-full">
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
