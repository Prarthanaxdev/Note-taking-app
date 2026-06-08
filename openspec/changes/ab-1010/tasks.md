# Tasks — AB-1010: Auth Pages (Frontend)

| Field | Value |
|---|---|
| Ticket | AB-1010 |
| Total tasks | 22 |
| Status | Complete |

---

## Phase 1 — Foundation (Auth Store)

> Checkpoint: `pnpm -r build` → 0 errors

- [x] **T-01 — Extend `authStore.ts` with `isBootstrapping` field**
  - File: `apps/web/src/store/authStore.ts`
  - Add to `AuthState` interface:
    ```typescript
    isBootstrapping: boolean;
    setBootstrappingDone: () => void;
    ```
  - Set initial value: `isBootstrapping: true`
  - Add action: `setBootstrappingDone: () => set({ isBootstrapping: false })`
  - Verify: `pnpm -r build` passes; `pnpm --filter web test` still passes (existing authStore tests unaffected)

---

## Phase 2 — Core Implementation

> T-02, T-03, T-04 are independent — [PARALLEL].
> T-05 through T-08 depend on T-03 + T-04 — [PARALLEL with each other].
> T-09 depends on all prior tasks.
>
> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-02 — Create `useTokenRefresh.ts`** [PARALLEL]
  - File: `apps/web/src/hooks/useTokenRefresh.ts` (new)
  - Import: `axios` (bare, NOT `apiClient`), `useEffect` from react, `useAuthStore`
  - On mount (empty dep array): call `axios.post<AuthResponse>('/api/v1/auth/refresh', {}, { withCredentials: true })`
    - `.then(({ data }) => { useAuthStore.getState().setAccessToken(data.accessToken); })`
    - `.catch(() => { useAuthStore.getState().clearAuth(); })`
    - `.finally(() => { useAuthStore.getState().setBootstrappingDone(); })`
  - Why bare axios: `apiClient` has a 401 interceptor that itself calls `/auth/refresh` — using apiClient here risks an infinite loop

- [x] **T-03 — Create `useAuth.ts`** [PARALLEL]
  - File: `apps/web/src/hooks/useAuth.ts` (new)
  - Imports: `useMutation` from `@tanstack/react-query`, `axios` (isAxiosError), `apiClient`, `AuthResponse` from `'shared'`, schemas from `'shared'`
  - Export `mapAuthError(err: unknown): { field: string; message: string }`:
    ```typescript
    const code = isAxiosError(err) ? (err.response?.data?.error?.code as string | undefined) : undefined;
    const map: Record<string, { field: string; message: string }> = {
      INVALID_CREDENTIALS: { field: 'root', message: 'Incorrect email or password.' },
      EMAIL_TAKEN:         { field: 'email', message: 'An account with this email already exists.' },
      OTP_EXPIRED:         { field: 'otp', message: 'This code has expired. Request a new one.' },
      OTP_USED:            { field: 'otp', message: 'This code has already been used.' },
      OTP_INVALID:         { field: 'otp', message: 'Invalid code. Check and try again.' },
    };
    return map[code ?? ''] ?? { field: 'root', message: 'Something went wrong. Please try again.' };
    ```
  - Export `useAuth()` returning `{ login, register, logout, forgotPassword, resetPassword }`:
    - `login`: `useMutation({ mutationFn: (d) => apiClient.post<AuthResponse>('/auth/login', d).then(r => r.data) })`
    - `register`: `useMutation({ mutationFn: (d) => apiClient.post<AuthResponse>('/auth/register', d).then(r => r.data) })`
    - `logout`: `useMutation({ mutationFn: () => Promise.resolve() })` — logout is client-side only (no server endpoint yet); component calls `clearAuth()` and `queryClient.clear()` in `onSuccess`
    - `forgotPassword`: `useMutation({ mutationFn: (d) => apiClient.post('/auth/forgot-password', d).then(r => r.data) })`
    - `resetPassword`: `useMutation({ mutationFn: (d) => apiClient.post('/auth/reset-password', d).then(r => r.data) })`

- [x] **T-04 — Create `AuthLayout.tsx`** [PARALLEL]
  - File: `apps/web/src/components/layout/AuthLayout.tsx` (new)
  - Props: `{ children: ReactNode; title: string }`
  - Renders: full-page centering wrapper + max-w-md card + title heading:
    ```tsx
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{title}</h1>
        {children}
      </div>
    </div>
    ```

- [x] **T-05 — Create `LoginPage.tsx`** [PARALLEL, depends on T-03 + T-04]
  - File: `apps/web/src/pages/auth/LoginPage.tsx` (new)
  - Form fields: `email` (type="email"), `password` (type="password")
  - Schema: `zodResolver(LoginSchema)` from `'shared'`
  - `onSuccess`: `useAuthStore.getState().setAccessToken(res.accessToken)` → `navigate('/notes')`
  - `onError`: `const e = mapAuthError(err); setError(e.field as ..., { message: e.message })`
  - Show `errors.root?.message` above submit button
  - Submit button: `disabled={login.isPending}`, text: `login.isPending ? 'Signing in…' : 'Sign in'`
  - "Forgot password?" link: `<Link to="/forgot-password">`
  - Wraps in `<AuthLayout title="Sign in">`

- [x] **T-06 — Create `RegisterPage.tsx`** [PARALLEL, depends on T-03 + T-04]
  - File: `apps/web/src/pages/auth/RegisterPage.tsx` (new)
  - Extended local schema (NOT exported to shared):
    ```typescript
    const RegisterFormSchema = RegisterSchema.extend({
      confirmPassword: z.string(),
    }).superRefine(({ password, confirmPassword }, ctx) => {
      if (password !== confirmPassword)
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
    });
    ```
  - Form fields: `email`, `password`, `confirmPassword`
  - `mutationFn` passes only `{ email, password }` (omit `confirmPassword` — not an API field)
  - `onSuccess`: set token → `navigate('/notes')`
  - `onError`: `EMAIL_TAKEN` → `setError('email', ...)`; others → `setError('root', ...)`
  - Submit button loading state + "Already have an account? Sign in" link to `/login`
  - Wraps in `<AuthLayout title="Create an account">`

- [x] **T-07 — Create `ForgotPasswordPage.tsx`** [PARALLEL, depends on T-03 + T-04]
  - File: `apps/web/src/pages/auth/ForgotPasswordPage.tsx` (new)
  - State: `const [submitted, setSubmitted] = useState(false)`
  - Form field: `email` only; `zodResolver(ForgotPasswordSchema)` from `'shared'`
  - `onSubmit`: call `forgotPassword.mutate(data, { onSuccess: () => setSubmitted(true), onError: () => setSubmitted(true) })` — **error is intentionally swallowed to prevent user enumeration** (FRS-FE-03)
  - When `submitted === true`: hide form, show: "If that email is registered, you'll receive a code shortly."
  - When `submitted === false`: show form with loading state on submit button
  - Wraps in `<AuthLayout title="Forgot password">`

- [x] **T-08 — Create `ResetPasswordPage.tsx`** [PARALLEL, depends on T-03 + T-04]
  - File: `apps/web/src/pages/auth/ResetPasswordPage.tsx` (new)
  - Extended local schema:
    ```typescript
    const ResetFormSchema = ResetPasswordSchema.extend({
      confirmPassword: z.string(),
    }).superRefine(({ newPassword, confirmPassword }, ctx) => {
      if (newPassword !== confirmPassword)
        ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
    });
    ```
  - Form fields: `email`, `otp` (type="text", inputMode="numeric", maxLength=6), `newPassword`, `confirmPassword`
  - `mutationFn` passes only `{ email, otp, newPassword }` (omit `confirmPassword`)
  - `onSuccess`: `navigate('/login')` (NOT `/notes` — must re-authenticate after reset)
  - `onError`: `OTP_EXPIRED`/`OTP_USED`/`OTP_INVALID` → `setError('otp', ...)`; others → `setError('root', ...)`
  - Submit button loading state
  - Wraps in `<AuthLayout title="Reset password">`

- [x] **T-09 — Update `App.tsx`** (depends on T-02, T-04, T-05, T-06, T-07, T-08)
  - File: `apps/web/src/App.tsx`
  - Add imports: `useTokenRefresh`, `useAuthStore`, all 4 page components, `AuthLayout`, `ReactNode`, `Navigate`, `useNavigate`
  - Add local `RequireAuth` component:
    ```tsx
    function RequireAuth({ children }: { children: ReactNode }) {
      const { accessToken, isBootstrapping } = useAuthStore();
      if (isBootstrapping) return <div className="flex h-screen items-center justify-center text-gray-400">Loading…</div>;
      if (!accessToken) return <Navigate to="/login" replace />;
      return <>{children}</>;
    }
    ```
  - Add local `PublicOnlyRoute` component:
    ```tsx
    function PublicOnlyRoute({ children }: { children: ReactNode }) {
      const { accessToken, isBootstrapping } = useAuthStore();
      if (isBootstrapping) return null;
      if (accessToken) return <Navigate to="/notes" replace />;
      return <>{children}</>;
    }
    ```
  - Call `useTokenRefresh()` at the top of `App` (fires once on mount)
  - Replace TODO placeholders:
    - `/login` → `<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>`
    - `/register` → `<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>`
    - `/forgot-password` → `<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>`
    - `/reset-password` → `<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>`
    - `/notes` → `<RequireAuth><div>TODO: NotesListPage</div></RequireAuth>`
    - `/notes/:id` → `<RequireAuth><div>TODO: NoteEditorPage</div></RequireAuth>`
    - `/search` → `<RequireAuth><div>TODO: SearchPage</div></RequireAuth>`
    - `/public/:token` unchanged (no auth required)

---

## Phase 3 — Integration Checkpoint

> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-10 — Lint + build gate**
  - `pnpm -r lint` → 0 errors across all packages
  - `pnpm -r build` → 0 TypeScript errors across all packages
  - Fix any issues before proceeding to tests

---

## Phase 4 — Tests

> **Coverage note:** `src/hooks/**`, `src/pages/**`, `src/components/**` are excluded from the
> coverage gate in `vitest.config.ts` ("covered in later tickets"). Tests in this phase run
> and must pass, but do not affect the coverage threshold.

#### `authStore.test.ts` — add two cases to existing file

- [x] **T-11 — AUTH-STORE-01/02: `isBootstrapping` initial state and `setBootstrappingDone`**
  - File: `apps/web/src/store/__tests__/authStore.test.ts` (modify existing)
  - Add to `beforeEach`: also reset `isBootstrapping: true` via `useAuthStore.setState({ ..., isBootstrapping: true })`
  - AUTH-STORE-01: initial `isBootstrapping` is `true`
  - AUTH-STORE-02: `setBootstrappingDone()` sets `isBootstrapping` to `false`

#### `useAuth.test.ts` — new file with MSW

> Setup: MSW `setupServer` with handlers for `/api/v1/auth/*`
> Use `renderHook` + `QueryClientProvider` wrapper

- [x] **T-12 — AUTH-HOOK-01/02: `login` mutation success and failure**
  - File: `apps/web/src/hooks/__tests__/useAuth.test.ts` (new)
  - MSW setup: server with handlers; `beforeAll(server.listen)`, `afterEach(server.resetHandlers)`, `afterAll(server.close)`
  - AUTH-HOOK-01: handler returns `200 { accessToken: 'tok' }` → `login.mutateAsync` resolves with `{ accessToken: 'tok' }`
  - AUTH-HOOK-02: handler returns `401 { error: { code: 'INVALID_CREDENTIALS' } }` → `login.mutateAsync` rejects

- [x] **T-13 — AUTH-HOOK-03/04/05: `mapAuthError` mapping**
  - AUTH-HOOK-03: axios error with code `INVALID_CREDENTIALS` → `{ field: 'root', message: 'Incorrect email or password.' }`
  - AUTH-HOOK-04: axios error with code `EMAIL_TAKEN` → `{ field: 'email', message: 'An account with this email already exists.' }`
  - AUTH-HOOK-05: axios error with unknown code → `{ field: 'root', message: 'Something went wrong. Please try again.' }`
  - Note: `mapAuthError` is a pure function — no MSW needed; construct mock axios errors directly

- [x] **T-14 — AUTH-HOOK-06: `register` mutation resolves on 201**
  - Handler: `POST /api/v1/auth/register` → `201 { accessToken: 'tok' }`
  - Assert: `register.mutateAsync` resolves with `{ accessToken: 'tok' }`

- [x] **T-15 — AUTH-HOOK-07: `forgotPassword` mutation resolves on 200**
  - Handler: `POST /api/v1/auth/forgot-password` → `200 { message: 'If registered, OTP sent' }`
  - Assert: `forgotPassword.mutateAsync` resolves without error (page swallows errors separately)

- [x] **T-16 — AUTH-HOOK-08: `resetPassword` mutation rejects on `OTP_EXPIRED`**
  - Handler: `POST /api/v1/auth/reset-password` → `400 { error: { code: 'OTP_EXPIRED' } }`
  - Assert: `resetPassword.mutateAsync` rejects; `mapAuthError` of the error → `{ field: 'otp', ... }`

---

## Phase 5 — Final Quality Gates

- [x] **T-17 — All quality gates pass**
  - `pnpm -r lint` → 0 errors
  - `pnpm -r build` → 0 type errors
  - `pnpm --filter web test` → all tests pass (coverage gate: only `authStore` counts; hooks tests run but not gated)
