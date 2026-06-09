import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button.js';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  onRetry: () => void;
}

export function SaveStatusIndicator({ status, onRetry }: SaveStatusIndicatorProps) {
  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-600">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-sm text-red-600">
      <AlertCircle className="h-3.5 w-3.5" />
      Error saving
      <Button variant="ghost" size="sm" onClick={onRetry} className="h-6 px-2 text-xs text-red-600 hover:text-red-700">
        Retry
      </Button>
    </span>
  );
}
