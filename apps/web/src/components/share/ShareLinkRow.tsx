import { useState, useEffect, useRef } from 'react';
import type { ShareLink } from 'shared';
import { useRevokeShareLink } from '../../hooks/useShares.js';
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

interface ShareLinkRowProps {
  link: ShareLink;
  noteId: string;
}

export function ShareLinkRow({ link, noteId }: ShareLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revokeLink = useRevokeShareLink(noteId);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  function handleCopy() {
    const url = `${window.location.origin}/public/${link.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  function handleRevoke() {
    revokeLink.mutate(link.id, { onSuccess: () => setRevokeOpen(false) });
  }

  const expiry = link.expiresAt
    ? new Date(link.expiresAt).toLocaleDateString()
    : 'Never';

  return (
    <div className="flex items-center gap-2 rounded-md border bg-gray-50 px-3 py-2 text-sm">
      <span className="font-mono text-gray-700">{link.token.slice(0, 8)}…</span>
      <span className="text-gray-500">Expires: {expiry}</span>
      <span className="text-gray-500">{link.viewCount} views</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? '✓ Copied!' : 'Copy URL'}
        </Button>
        <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Revoke
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this share link?</AlertDialogTitle>
              <AlertDialogDescription>
                Anyone with this link will immediately lose access. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevoke}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              >
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
