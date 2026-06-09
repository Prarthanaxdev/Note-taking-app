# Plan — AB-1017: UI Polish and Visual Design

## Implementation Order

All changes are purely frontend. No API, DB, or shared-package work.

```
Phase 0 — Foundation (tokens + toast)
  T-00  index.css + tailwind.config.ts   (color tokens)
  T-01  App.tsx                           (mount Toaster)

Phase 1 — Shell & Auth (highest visibility, nothing depends on them)
  T-02  AppShell.tsx                      (brand mark, nav active states, bg tokens)
  T-03  AuthLayout.tsx                    (gradient bg, shadow-md card)
  T-04  LoginPage / RegisterPage /
        ForgotPasswordPage / ResetPasswordPage
                                          (button + input + link token swap)

Phase 2 — Editor surface [after T-00]
  T-05  NoteEditorPage.tsx                (paper card wrapper)
  T-06  EditorToolbar.tsx                 (active state tokens)
  T-07  NoteEditor.tsx                    (prose class update)

Phase 3 — Lists & Search [after T-00]
  T-08  NoteCard.tsx                      (focus ring token)
  T-09  NotesListPage.tsx                 (focus ring + text-foreground)
  T-10  NoteList.tsx                      (empty state upgrade)
  T-11  SearchPage.tsx                    (focus ring + empty state upgrade)
  T-12  SearchResultCard.tsx              (focus ring + card consistency)

Phase 4 — Share & Version (toast wiring) [after T-01]
  T-13  ShareModal.tsx                    (focus ring token)
  T-14  ShareLinkRow.tsx                  (toast.success on copy + revoke)
  T-15  VersionPreview.tsx                (toast.success on restore)

Phase 5 — Quality gates
  T-16  Run pnpm -r lint / build / test
  T-17  Manual responsive check at 375px
  T-18  Run npx playwright test
```

Phases 1, 2, and 3 can all be worked in parallel after Phase 0 is green.
Phase 4 requires Phase 0's `<Toaster>` mount (T-01) to be complete.
