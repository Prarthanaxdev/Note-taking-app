import { useState } from 'react';
import { toast } from 'sonner';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useVersionDetail, useRestoreVersion } from '../../hooks/useVersions.js';
import { Button } from '../ui/button.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog.js';

interface VersionPreviewProps {
  noteId: string;
  versionId: string;
  isCurrentVersion: boolean;
  onBack: () => void;
  onRestored: () => void;
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="h-6 w-3/4 animate-pulse rounded bg-gray-200" />
      <div className="h-4 animate-pulse rounded bg-gray-100" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

function ReadOnlyEditor({ content }: { content: object | null }) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: content ?? '',
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose max-w-none p-4',
      },
    },
  });

  return <EditorContent editor={editor} />;
}

export function VersionPreview({
  noteId,
  versionId,
  isCurrentVersion,
  onBack,
  onRestored,
}: VersionPreviewProps) {
  const [restoreOpen, setRestoreOpen] = useState(false);
  const { data: version, isLoading } = useVersionDetail(noteId, versionId);
  const restoreVersion = useRestoreVersion(noteId);

  function handleRestore() {
    restoreVersion.mutate(versionId, {
      onSuccess: () => {
        toast.success('Version restored');
        setRestoreOpen(false);
        onRestored();
      },
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <button
          onClick={onBack}
          className="text-sm text-primary hover:text-primary/80 font-medium"
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <PreviewSkeleton />}
        {!isLoading && version && (
          <>
            <h2 className="px-4 pt-4 pb-2 font-semibold text-gray-900">
              {version.title || 'Untitled'}
            </h2>
            <ReadOnlyEditor content={version.content} />
          </>
        )}
      </div>

      {!isCurrentVersion && (
        <div className="border-t px-4 py-3">
          <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                Restore this version
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore this version?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace the current note content with this version. A new
                  version snapshot will be saved automatically. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRestore}
                  disabled={restoreVersion.isPending}
                >
                  {restoreVersion.isPending ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Restoring…
                    </span>
                  ) : (
                    'Restore'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
