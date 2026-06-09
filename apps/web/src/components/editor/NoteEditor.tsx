import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useUpdateNote } from '../../hooks/useNotes.js';
import { EditorToolbar } from './EditorToolbar.js';
import type { SaveStatus } from './SaveStatusIndicator.js';

interface NoteEditorProps {
  noteId: string;
  initialContent: object | null;
  title: string;
  tagIds: string[];
  onStatusChange: (s: SaveStatus) => void;
}

export function NoteEditor({
  noteId,
  initialContent,
  title,
  tagIds,
  onStatusChange,
}: NoteEditorProps) {
  const { mutate: updateNote } = useUpdateNote();

  const [contentSnapshot, setContentSnapshot] = useState(
    () => JSON.stringify(initialContent ?? {})
  );

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: initialContent ?? '',
    onUpdate: ({ editor: e }) => setContentSnapshot(JSON.stringify(e.getJSON())),
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-full p-4',
      },
    },
  });

  const savedTitleRef = useRef(title);
  const savedContentRef = useRef(JSON.stringify(initialContent));
  const savedTagIdsRef = useRef(tagIds.slice().sort().join(','));

  const isDirty =
    title !== savedTitleRef.current ||
    contentSnapshot !== savedContentRef.current ||
    tagIds.slice().sort().join(',') !== savedTagIdsRef.current;

  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      onStatusChange('saving');
      setHasError(false);

      updateNote(
        {
          id: noteId,
          title,
          content: editor?.getJSON() ?? null,
          tagIds,
        },
        {
          onSuccess: (note) => {
            savedTitleRef.current = note.title;
            savedContentRef.current = JSON.stringify(note.content);
            savedTagIdsRef.current = note.tags.map((t) => t.id).sort().join(',');
            onStatusChange('saved');
            setHasError(false);
          },
          onError: () => {
            onStatusChange('error');
            setHasError(true);
          },
        }
      );
    }, 2000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, contentSnapshot, tagIds.join(',')]);

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
