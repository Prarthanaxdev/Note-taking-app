import { ArrowUpDown } from 'lucide-react';
import type { SortBy, SortOrder } from '../../hooks/useNotes.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select.js';
import { Button } from '../ui/button.js';

interface SortControlProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (value: SortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
}

export function SortControl({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: SortControlProps) {
  function toggleOrder() {
    onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc');
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="updatedAt">Last modified</SelectItem>
          <SelectItem value="createdAt">Date created</SelectItem>
          <SelectItem value="title">Title</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleOrder}
        aria-label={sortOrder === 'desc' ? 'Sort ascending' : 'Sort descending'}
        className="h-8 gap-1 px-2 text-xs"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
      </Button>
    </div>
  );
}
