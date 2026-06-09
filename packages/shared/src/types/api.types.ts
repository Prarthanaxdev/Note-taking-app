export type TagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type TagWithCount = TagSummary & { noteCount: number };

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type NoteListItem = {
  id: string;
  title: string;
  contentPreview: string;
  tags: TagSummary[];
  updatedAt: string;
};

export type NoteDetail = {
  id: string;
  title: string;
  content: object | null;
  tags: TagSummary[];
  shareLinksCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SearchResult = {
  id: string;
  title: string;
  headline: string;
  updatedAt: string;
};

export type ShareLink = {
  id: string;
  noteId: string;
  userId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
};

export type VersionListItem = {
  id: string;
  savedAt: string;
};

export type VersionDetail = {
  id: string;
  title: string;
  content: object | null;
  savedAt: string;
};
