# Plan — AB-1010: Auth Pages (Frontend)

## Files to Create / Modify

| File | Action |
|---|---|
| `apps/web/src/store/authStore.ts` | Modified — add `isBootstrapping: boolean` field |
| `apps/web/src/hooks/useTokenRefresh.ts` | New — on-load silent refresh, sets `isBootstrapping = false` when done |
| `apps/web/src/hooks/useAuth.ts` | New — 5 TanStack Query mutations + `mapAuthError` helper |
| `apps/web/src/components/layout/AuthLayout.tsx` | New — centered card wrapper |
| `apps/web/src/pages/auth/LoginPage.tsx` | New |
| `apps/web/src/pages/auth/RegisterPage.tsx` | New |
| `apps/web/src/pages/auth/ForgotPasswordPage.tsx` | New |
| `apps/web/src/pages/auth/ResetPasswordPage.tsx` | New |
| `apps/web/src/App.tsx` | Modified — wire real components, `RequireAuth`, `useTokenRefresh` |
| `apps/web/src/hooks/__tests__/useAuth.test.ts` | New — MSW-backed hook tests |

**No DB changes. No API changes. No new shared types.** All Zod schemas (`RegisterSchema`, `LoginSchema`, `ForgotPasswordSchema`, `ResetPasswordSchema`) already exist in `packages/shared`.

### shadcn/ui note

`@radix-ui/*` and `class-variance-authority` are not in `package.json` — shadcn is not installed. Auth forms use plain Tailwind + react-hook-form. `FormMessage` equivalent is a `<p className="text-sm text-destructive">` below each field. Full shadcn setup is a separate chore.

---

## Architecture Decisions

### 1. `isBootstrapping` in `authStore`

`RequireAuth` needs to know whether the initial refresh attempt is still pending (to show a spinner rather than immediately redirecting). Rather than prop-drilling a boolean from `App.tsx`, add `isBootstrapping: boolean` to `authStore`. It starts `true`, and `useTokenRefresh` sets it to `false` in a `finally` block regardless of success or failure.

```typescript
// Addition to authStore.ts
isBootstrapping: boolean;   // true until first refresh attempt settles
setBootstrappingDone: () => void;
```

### 2. `useTokenRefresh` uses bare `axios`, not `apiClient`

`apiClient` has a 401 interceptor that calls `POST /auth/refresh` — calling `apiClient.post('/auth/refresh')` from `useTokenRefresh` could create an infinite loop if the interceptor fires on a 401 from the refresh endpoint itself. The hook uses bare `axios.post` (same pattern as the existing interceptor in `apiClient.ts`).

```typescript
// useTokenRefresh.ts
useEffect(() => {
  axios.post<AuthResponse>('/api/v1/auth/refresh', {}, { withCredentials: true })
    .then(({ data }) => { useAuthStore.getState().setAccessToken(data.accessToken); })
    .catch(() => { useAuthStore.getState().clearAuth(); })
    .finally(() => { useAuthStore.getState().setBootstrappingDone(); });
}, []); // empty array — fires exactly once on mount
```

### 3. `RequireAuth` is a local component in `App.tsx`

It's only ~15 lines and used only in `App.tsx`. No separate file needed.

```typescript
function RequireAuth({ children }: { children: ReactNode }) {
  const { accessToken, isBootstrapping } = useAuthStore();
  if (isBootstrapping) return <div className="flex h-screen items-center justify-center">Loading…</div>;
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { accessToken, isBootstrapping } = useAuthStore();
  if (isBootstrapping) return null;
  if (accessToken) return <Navigate to="/notes" replace />;
  return <>{children}</>;
}
```

### 4. `useAuth` exports five mutations; error mapping is a local helper

Each mutation is a `useMutation` call. Error mapping (error code → human message + field name) lives in a `mapAuthError(err: unknown)` helper inside `useAuth.ts`. Pages call `form.setError()` in the mutation's `mutate()` onError option, using `mapAuthError` to get the field and message.

```typescript
// useAuth.ts
export function mapAuthError(err: unknown): { field: string; message: string } {
  const code = isAxiosError(err) ? err.response?.data?.error?.code : null;
  const map: Record<string, { field: string; message: string }> = {
    INVALID_CREDENTIALS: { field: 'root', message: 'Incorrect email or password.' },
    EMAIL_TAKEN:          { field: 'email', message: 'An account with this email already exists.' },
    OTP_EXPIRED:          { field: 'otp', message: 'This code has expired. Request a new one.' },
    OTP_USED:             { field: 'otp', message: 'This code has already been used.' },
    OTP_INVALID:          { field: 'otp', message: 'Invalid code. Check and try again.' },
  };
  return map[code] ?? { field: 'root', message: 'Something went wrong. Please try again.' };
}

export function useAuth() {
  const navigate = useNavigate();
  return {
    login:           useMutation({ mutationFn: (d) => apiClient.post('/auth/login', d).then(r => r.data) }),
    register:        useMutation({ mutationFn: (d) => apiClient.post('/auth/register', d).then(r => r.data) }),
    logout:          useMutation({ mutationFn: () => apiClient.post('/auth/logout').then(r => r.data) }),
    forgotPassword:  useMutation({ mutationFn: (d) => apiClient.post('/auth/forgot-password', d).then(r => r.data) }),
    resetPassword:   useMutation({ mutationFn: (d) => apiClient.post('/auth/reset-password', d).then(r => r.data) }),
  };
}
```

`logout` clears `authStore` and the TanStack Query cache in its `onSuccess`. No `POST /auth/logout` endpoint exists in the backend yet — logout is client-side only: `clearAuth()` + `queryClient.clear()` + navigate to `/login`.

### 5. Forms use `react-hook-form` + `zodResolver`, no shadcn

`@hookform/resolvers` is already installed. Each page:
1. Extends the base schema with a `confirmPassword` field (for register/reset) using `.superRefine()` or `.extend()`
2. Uses `useForm({ resolver: zodResolver(ExtendedSchema) })`
3. Renders `<input {...register('field')} />` with Tailwind classes
4. Renders errors via `{errors.field && <p className="text-sm text-red-600">{errors.field.message}</p>}`

`root` errors (API-level) render via `{errors.root && <p className="...">{errors.root.message}</p>}` above the submit button.

### 6. ForgotPasswordPage never shows API errors

Per FRS-FE-03 and the spec: after submission, always show a generic success message regardless of API outcome. The `onError` callback of `forgotPassword.mutate()` is intentionally a no-op — the success message renders when `forgotPassword.isSuccess` OR after first submit attempt.

---

## TypeScript Types

### `authStore.ts` additions

```typescript
interface AuthState {
  // existing fields unchanged
  accessToken: string | null;
  user: UserProfile | null;
  isBootstrapping: boolean;            // NEW
  setAccessToken: (token: string) => void;
  setUser: (user: UserProfile) => void;
  clearAuth: () => void;
  setBootstrappingDone: () => void;    // NEW
}
```

### Extended form schemas (local to each page, not in `packages/shared`)

```typescript
// RegisterPage.tsx — local, not exported to shared
const RegisterFormSchema = RegisterSchema.extend({
  confirmPassword: z.string(),
}).superRefine(({ password, confirmPassword }, ctx) => {
  if (password !== confirmPassword) {
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
  }
});

// ResetPasswordPage.tsx — local
const ResetFormSchema = ResetPasswordSchema.extend({
  confirmPassword: z.string(),
}).superRefine(({ newPassword, confirmPassword }, ctx) => {
  if (newPassword !== confirmPassword) {
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
  }
});
```

---

## Implementation Details

### `AuthLayout.tsx`

```tsx
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  );
}
```

### Typical page pattern (LoginPage as example)

```tsx
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = (data: z.infer<typeof LoginSchema>) => {
    login.mutate(data, {
      onSuccess: (res) => {
        useAuthStore.getState().setAccessToken(res.accessToken);
        navigate('/notes');
      },
      onError: (err) => {
        const { field, message } = mapAuthError(err);
        setError(field as keyof LoginFormValues | 'root', { message });
      },
    });
  };

  return (
    <AuthLayout>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}
        <input {...register('email')} type="email" placeholder="Email" />
        {errors.email && <p>{errors.email.message}</p>}
        <input {...register('password')} type="password" placeholder="Password" />
        {errors.password && <p>{errors.password.message}</p>}
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <Link to="/forgot-password">Forgot password?</Link>
      </form>
    </AuthLayout>
  );
}
```

### `App.tsx` after changes

```tsx
export default function App() {
  useTokenRefresh(); // fires once on mount

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/notes" replace />} />
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
      <Route path="/reset-password" element={<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>} />
      <Route path="/notes" element={<RequireAuth><div>TODO: NotesListPage</div></RequireAuth>} />
      <Route path="/notes/:id" element={<RequireAuth><div>TODO: NoteEditorPage</div></RequireAuth>} />
      <Route path="/search" element={<RequireAuth><div>TODO: SearchPage</div></RequireAuth>} />
      <Route path="/public/:token" element={<div>TODO: PublicNotePage</div>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
```

---

## Test Plan

**Coverage note:** `src/hooks/**`, `src/pages/**`, `src/components/**` are excluded from the coverage gate in `vitest.config.ts` ("covered in later tickets"). Tests are written but not gate-blocking.

### `useAuth.test.ts` — MSW-backed hook tests

```typescript
// Setup: MSW server mocking /api/v1/auth/login, /auth/register, etc.
// Use renderHook + act from @testing-library/react
```

| ID | Scenario |
|---|---|
| AUTH-HOOK-01 | `login.mutate` on 200 → resolves with `{ accessToken }` |
| AUTH-HOOK-02 | `login.mutate` on 401 `INVALID_CREDENTIALS` → rejects with axios error |
| AUTH-HOOK-03 | `mapAuthError` with `INVALID_CREDENTIALS` → `{ field: 'root', message: ... }` |
| AUTH-HOOK-04 | `mapAuthError` with `EMAIL_TAKEN` → `{ field: 'email', message: ... }` |
| AUTH-HOOK-05 | `mapAuthError` with unknown code → `{ field: 'root', message: 'Something went wrong' }` |
| AUTH-HOOK-06 | `register.mutate` on 201 → resolves |
| AUTH-HOOK-07 | `forgotPassword.mutate` on 200 → resolves (errors swallowed by page) |
| AUTH-HOOK-08 | `resetPassword.mutate` on 400 `OTP_EXPIRED` → rejects with correct code |

### `authStore.test.ts` — add `isBootstrapping` tests

| ID | Scenario |
|---|---|
| AUTH-STORE-01 | Initial `isBootstrapping` is `true` |
| AUTH-STORE-02 | `setBootstrappingDone()` sets `isBootstrapping` to `false` |

---

## Checkpoints

```bash
# After Phase 1 (authStore + hooks):
pnpm -r build     # 0 type errors

# After Phase 2 (pages + App.tsx wired):
pnpm -r lint      # 0 errors
pnpm -r build     # 0 type errors

# After Phase 3 (tests):
pnpm --filter web test   # all passing (hooks/pages excluded from coverage gate)
```
