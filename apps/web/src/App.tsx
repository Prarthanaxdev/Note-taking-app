import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import { useTokenRefresh } from './hooks/useTokenRefresh.js';
import LoginPage from './pages/auth/LoginPage.js';
import RegisterPage from './pages/auth/RegisterPage.js';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.js';
import ResetPasswordPage from './pages/auth/ResetPasswordPage.js';

function RequireAuth({ children }: { children: ReactNode }) {
  const { accessToken, isBootstrapping } = useAuthStore();
  if (isBootstrapping)
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { accessToken, isBootstrapping } = useAuthStore();
  if (isBootstrapping) return null;
  if (accessToken) return <Navigate to="/notes" replace />;
  return <>{children}</>;
}

export default function App() {
  useTokenRefresh();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/notes" replace />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicOnlyRoute>
            <ResetPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/notes"
        element={
          <RequireAuth>
            <div>TODO: NotesListPage</div>
          </RequireAuth>
        }
      />
      <Route
        path="/notes/:id"
        element={
          <RequireAuth>
            <div>TODO: NoteEditorPage</div>
          </RequireAuth>
        }
      />
      <Route
        path="/search"
        element={
          <RequireAuth>
            <div>TODO: SearchPage</div>
          </RequireAuth>
        }
      />
      <Route path="/public/:token" element={<div>TODO: PublicNotePage</div>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
