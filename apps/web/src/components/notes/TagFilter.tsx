import type { TagWithCount } from 'shared';
import { Badge } from '../ui/badge.js';
import { Checkbox } from '../ui/checkbox.js';

interface TagFilterProps {
  tags: TagWithCount[];
  selectedTagIds: string[];
  onToggle: (id: string) => void;
}

export function TagFilter({ tags, selectedTagIds, onToggle }: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Filter by tag
      </span>
      {tags.map((tag) => (
        <label
          key={tag.id}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
        >
          <Checkbox
            id={`tag-${tag.id}`}
            checked={selectedTagIds.includes(tag.id)}
            onCheckedChange={() => onToggle(tag.id)}
          />
          <span className="flex flex-1 items-center gap-1.5 text-sm text-gray-700">
            {tag.color && (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
            )}
            {tag.name}
          </span>
          <Badge variant="secondary" className="ml-auto text-xs tabular-nums">
            {tag.noteCount}
          </Badge>
        </label>
      ))}
    </div>
  );
}
