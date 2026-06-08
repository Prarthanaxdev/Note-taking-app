import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/notes" replace />} />
      <Route path="/login" element={<div>TODO: LoginPage</div>} />
      <Route path="/register" element={<div>TODO: RegisterPage</div>} />
      <Route path="/forgot-password" element={<div>TODO: ForgotPasswordPage</div>} />
      <Route path="/reset-password" element={<div>TODO: ResetPasswordPage</div>} />
      <Route path="/notes" element={<div>TODO: NotesListPage</div>} />
      <Route path="/notes/:id" element={<div>TODO: NoteEditorPage</div>} />
      <Route path="/search" element={<div>TODO: SearchPage</div>} />
      <Route path="/public/:token" element={<div>TODO: PublicNotePage</div>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
