import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code,
} from 'lucide-react';
import { Button } from '../ui/button.js';
import { Separator } from '../ui/separator.js';

interface EditorToolbarProps {
  editor: Editor | null;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-pressed={editor.isActive('bold')}
        className={editor.isActive('bold') ? 'bg-gray-100' : ''}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-pressed={editor.isActive('italic')}
        className={editor.isActive('italic') ? 'bg-gray-100' : ''}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        aria-pressed={editor.isActive('underline')}
        className={editor.isActive('underline') ? 'bg-gray-100' : ''}
        title="Underline"
      >
        <Underline className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-pressed={editor.isActive('heading', { level: 1 })}
        className={editor.isActive('heading', { level: 1 }) ? 'bg-gray-100' : ''}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-pressed={editor.isActive('heading', { level: 2 })}
        className={editor.isActive('heading', { level: 2 }) ? 'bg-gray-100' : ''}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        aria-pressed={editor.isActive('heading', { level: 3 })}
        className={editor.isActive('heading', { level: 3 }) ? 'bg-gray-100' : ''}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-pressed={editor.isActive('bulletList')}
        className={editor.isActive('bulletList') ? 'bg-gray-100' : ''}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-pressed={editor.isActive('orderedList')}
        className={editor.isActive('orderedList') ? 'bg-gray-100' : ''}
        title="Ordered list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-pressed={editor.isActive('blockquote')}
        className={editor.isActive('blockquote') ? 'bg-gray-100' : ''}
        title="Blockquote"
      >
        <Quote className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-pressed={editor.isActive('codeBlock')}
        className={editor.isActive('codeBlock') ? 'bg-gray-100' : ''}
        title="Code block"
      >
        <Code className="h-4 w-4" />
      </Button>
    </div>
  );
}
