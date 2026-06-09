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

export function VersionDrawer({ open, onOpenChange }: VersionDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-gray-500 mt-4">Version history coming soon.</p>
      </SheetContent>
    </Sheet>
  );
}
