import { useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { useTags, useCreateTag } from '../../hooks/useTags.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';

interface TagComboboxProps {
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagCombobox({ selectedTagIds, onChange }: TagComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: allTags = [] } = useTags();
  const createTag = useCreateTag();

  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const hasExactMatch = allTags.some(
    (t) => t.name.toLowerCase() === search.trim().toLowerCase()
  );

  const canCreate = search.trim().length > 0 && !hasExactMatch;
  const atMax = selectedTagIds.length >= 5;

  function toggleTag(id: string) {
    if (selectedTagIds.includes(id)) {
      onChange(selectedTagIds.filter((t) => t !== id));
    } else if (!atMax) {
      onChange([...selectedTagIds, id]);
    }
  }

  function handleCreate() {
    const name = search.trim();
    if (!name || atMax) return;
    createTag.mutate(
      { name },
      {
        onSuccess: (tag) => {
          onChange([...selectedTagIds, tag.id]);
          setSearch('');
        },
      }
    );
  }

  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 max-w-[240px] justify-between gap-1 px-2 text-xs"
        >
          {selectedTags.length > 0 ? (
            <span className="flex flex-wrap gap-1 overflow-hidden">
              {selectedTags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="px-1 py-0 text-xs"
                  style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color } : undefined}
                >
                  {tag.name}
                </Badge>
              ))}
              {selectedTags.length > 3 && (
                <span className="text-gray-400">+{selectedTags.length - 3}</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">Add tags…</span>
          )}
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <Command>
          <CommandInput
            placeholder="Search tags…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim().length === 0 ? 'No tags yet.' : `No tag named "${search}".`}
            </CommandEmpty>

            {canCreate && !atMax && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={handleCreate}
                  disabled={createTag.isPending}
                  className="gap-2"
                >
                  <Plus className="h-3.5 w-3.5 text-blue-500" />
                  <span>
                    Create <span className="font-medium">"{search.trim()}"</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  const isDisabled = !isSelected && atMax;
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => toggleTag(tag.id)}
                      aria-disabled={isDisabled}
                      className={cn('gap-2', isDisabled && 'pointer-events-none opacity-40')}
                    >
                      <Check
                        className={cn('h-3.5 w-3.5', isSelected ? 'opacity-100' : 'opacity-0')}
                      />
                      {tag.color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      <span className="flex-1 truncate">{tag.name}</span>
                      <span className="text-xs text-gray-400">{tag.noteCount}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {atMax && (
              <div className="px-3 py-2 text-xs text-gray-400">
                Maximum 5 tags reached.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
