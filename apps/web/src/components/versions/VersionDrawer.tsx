import { useState } from 'react';
import { useVersionList } from '../../hooks/useVersions.js';
import { VersionPreview } from './VersionPreview.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet.js';

interface VersionDrawerProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 mt-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-gray-100" />
      ))}
    </div>
  );
}

export function VersionDrawer({ noteId, open, onOpenChange }: VersionDrawerProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const { data: versions = [], isLoading } = useVersionList(noteId);

  function handleOpenChange(value: boolean) {
    if (!value) setSelectedVersionId(null);
    onOpenChange(value);
  }

  const isPreview = selectedVersionId !== null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-80 flex flex-col p-0">
        {!isPreview && (
          <>
            <SheetHeader className="px-4 py-4 border-b">
              <SheetTitle>Version history</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {isLoading && <ListSkeleton />}

              {!isLoading && versions.length === 0 && (
                <p className="mt-4 text-sm text-gray-500">No version history yet.</p>
              )}

              {!isLoading && versions.length > 0 && (
                <ul className="flex flex-col gap-1 mt-2">
                  {versions.map((version, index) => (
                    <li key={version.id}>
                      {index === 0 ? (
                        <div className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 bg-gray-50">
                          <span>{new Date(version.savedAt).toLocaleString()}</span>
                          <span className="text-xs font-medium text-gray-400 ml-2">
                            Current
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedVersionId(version.id)}
                          className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {new Date(version.savedAt).toLocaleString()}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {isPreview && (
          <VersionPreview
            noteId={noteId}
            versionId={selectedVersionId}
            isCurrentVersion={selectedVersionId === versions[0]?.id}
            onBack={() => setSelectedVersionId(null)}
            onRestored={() => handleOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
