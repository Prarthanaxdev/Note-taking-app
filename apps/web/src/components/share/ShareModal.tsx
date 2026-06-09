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

export function ShareModal({ open, onOpenChange }: ShareModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">Share feature coming soon.</p>
      </DialogContent>
    </Dialog>
  );
}
