import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FilePlus, FileText, Search, LogOut, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { useAuthStore } from '../../store/authStore.js';
import { useCreateNote } from '../../hooks/useNotes.js';
import { Button } from '../ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';

function NewNoteButton() {
  const navigate = useNavigate();
  const createNote = useCreateNote();

  function handleClick() {
    createNote.mutate(
      { title: 'Untitled' },
      { onSuccess: (note) => navigate(`/notes/${note.id}`) }
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={createNote.isPending}
      className="w-full justify-start gap-2"
      variant="default"
    >
      {createNote.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FilePlus className="h-4 w-4" />
      )}
      New Note
    </Button>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  function handleLogout() {
    useAuthStore.getState().clearAuth();
    qc.clear();
    navigate('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="flex-1 truncate text-left">{user?.email ?? 'Account'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={handleLogout} className="gap-2 text-red-600">
          <LogOut className="h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-gray-100 text-gray-900'
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  );

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-white px-3 py-4">
        <div className="mb-6 px-2 text-lg font-bold tracking-tight text-gray-900">
          NoteApp
        </div>
        <NewNoteButton />
        <nav className="mt-4 flex flex-col gap-1">
          <NavLink to="/notes" className={navLinkClass}>
            <FileText className="h-4 w-4" />
            Notes
          </NavLink>
          <NavLink to="/search" className={navLinkClass}>
            <Search className="h-4 w-4" />
            Search
          </NavLink>
        </nav>
        <div className="mt-auto">
          <UserMenu />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
