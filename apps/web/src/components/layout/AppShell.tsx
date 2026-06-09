import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FilePlus, FileText, Search, LogOut, PenLine } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { useAuthStore } from '../../store/authStore.js';
import { Button } from '../ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';

function NewNoteButton() {
  const navigate = useNavigate();

  function handleClick() {
    navigate('/notes/new');
  }

  return (
    <Button
      onClick={handleClick}
      className="w-full justify-start gap-2"
      variant="default"
    >
      <FilePlus className="h-4 w-4" />
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
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
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
      ? 'bg-primary/10 text-primary font-semibold'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  );

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-page-bg">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2 text-primary">
          <PenLine className="h-5 w-5" />
          <span className="text-lg font-bold tracking-tight">NoteApp</span>
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
      <main className="min-w-0 flex-1 overflow-y-auto p-5">{children}</main>
    </div>
  );
}
