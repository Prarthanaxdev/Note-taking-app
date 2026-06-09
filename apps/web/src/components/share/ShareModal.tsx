import { useState } from 'react';
import { useShareLinks, useCreateShareLink } from '../../hooks/useShares.js';
import { ShareLinkRow } from './ShareLinkRow.js';
import { Button } from '../ui/button.js';
import { Separator } from '../ui/separator.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js';

interface ShareModalProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ShareLinkSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md border bg-gray-100" />
      ))}
    </div>
  );
}

export function ShareModal({ noteId, open, onOpenChange }: ShareModalProps) {
  const [expiresAt, setExpiresAt] = useState('');
  const { data: links = [], isLoading } = useShareLinks(noteId);
  const createLink = useCreateShareLink(noteId);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const body: { expiresAt?: string } = {};
    if (expiresAt) {
      body.expiresAt = new Date(`${expiresAt}T23:59:59`).toISOString();
    }
    createLink.mutate(body, {
      onSuccess: () => setExpiresAt(''),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="share-expiry" className="text-xs text-gray-500">
              Expiry date (optional)
            </label>
            <input
              id="share-expiry"
              type="date"
              min={minDate}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" disabled={createLink.isPending}>
            {createLink.isPending ? (
              <span className="flex items-center gap-1.5">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating…
              </span>
            ) : (
              'Generate'
            )}
          </Button>
        </form>

        <Separator />

        {isLoading && <ShareLinkSkeleton />}

        {!isLoading && links.length === 0 && (
          <p className="text-sm text-gray-500">No active links yet.</p>
        )}

        {!isLoading && links.length > 0 && (
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <ShareLinkRow key={link.id} link={link} noteId={noteId} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
