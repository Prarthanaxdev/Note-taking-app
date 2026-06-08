import { create } from 'zustand';

interface UIState {
  shareModalNoteId: string | null;
  versionDrawerNoteId: string | null;
  openShareModal: (noteId: string) => void;
  closeShareModal: () => void;
  openVersionDrawer: (noteId: string) => void;
  closeVersionDrawer: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  shareModalNoteId: null,
  versionDrawerNoteId: null,
  openShareModal: (noteId) => set({ shareModalNoteId: noteId }),
  closeShareModal: () => set({ shareModalNoteId: null }),
  openVersionDrawer: (noteId) => set({ versionDrawerNoteId: noteId }),
  closeVersionDrawer: () => set({ versionDrawerNoteId: null }),
}));
