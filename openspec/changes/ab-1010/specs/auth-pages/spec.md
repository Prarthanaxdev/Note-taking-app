# Spec — auth-pages

## ADDED Requirements

### Requirement: Login form with inline validation and redirect

The system SHALL render a login form at `/login` with Email and Password fields. On successful authentication the user SHALL be redirected to `/notes`. API errors (e.g. `INVALID_CREDENTIALS`) SHALL be displayed inline via `FormMessage`. The form SHALL use `react-hook-form` with `zodResolver(LoginSchema)` imported from `packages/shared`.

#### Scenario: Successful login redirects to /notes
- **WHEN** a user submits valid credentials
- **THEN** the system calls `POST /auth/login`, stores the returned `accessToken` in `authStore`, and navigates to `/notes`

#### Scenario: Invalid credentials shows inline error
- **WHEN** the API returns `INVALID_CREDENTIALS`
- **THEN** an error message is shown below the Password field (or as `root` error) without a page reload

#### Scenario: Submit button disabled while request is in-flight
- **WHEN** the form is submitted and the API call has not yet resolved
- **THEN** the submit button is disabled and shows a loading indicator

#### Scenario: Empty field fails Zod validation before submission
- **WHEN** the user submits the form with an empty Email or Password
- **THEN** the form displays a `FormMessage` below the offending field; no API call is made

#### Scenario: "Forgot password?" link navigates correctly
- **WHEN** the user clicks "Forgot password?"
- **THEN** the browser navigates to `/forgot-password`

---

### Requirement: Registration form with password-match validation

The system SHALL render a registration form at `/register` with Email, Password, and Confirm Password fields. Passwords MUST be compared client-side before submission. On success the user SHALL be redirected to `/notes`.

#### Scenario: Successful registration redirects to /notes
- **WHEN** a user submits valid registration data with matching passwords
- **THEN** the system calls `POST /auth/register`, stores the `accessToken`, and navigates to `/notes`

#### Scenario: Mismatched passwords blocks submission
- **WHEN** the user enters different values in Password and Confirm Password
- **THEN** a `FormMessage` appears on the Confirm Password field; no API call is made

#### Scenario: EMAIL_TAKEN shows inline error
- **WHEN** the API returns `EMAIL_TAKEN`
- **THEN** an error message is displayed on the Email field

#### Scenario: Submit button shows loading state during registration
- **WHEN** the registration API call is in-flight
- **THEN** the submit button is disabled and shows a loading indicator

---

### Requirement: Forgot-password form with generic success response

The system SHALL render a form at `/forgot-password` with a single Email field. After submission, the system SHALL display a generic success message regardless of whether the email is registered — matching the API's `{ message: 'If registered, OTP sent' }` design to prevent user enumeration.

#### Scenario: Form submitted — success message always shown
- **WHEN** a user submits any email address (registered or not)
- **THEN** the form disappears and a generic success message is shown; no error states are rendered

#### Scenario: Invalid email format blocked client-side
- **WHEN** the user submits a string that is not a valid email
- **THEN** `FormMessage` appears below the Email field; no API call is made

---

### Requirement: Reset-password form with OTP input

The system SHALL render a form at `/reset-password` with fields: Email, OTP (6-digit), New Password, Confirm Password. On success the user SHALL be redirected to `/login` (not `/notes` — credentials must be re-entered after reset). API errors (`OTP_EXPIRED`, `OTP_USED`, `OTP_INVALID`) SHALL be mapped to inline messages.

#### Scenario: Successful reset redirects to /login
- **WHEN** a user submits a valid OTP and matching passwords
- **THEN** the system calls `POST /auth/reset-password` and redirects to `/login`

#### Scenario: OTP_EXPIRED shows inline error
- **WHEN** the API returns `OTP_EXPIRED`
- **THEN** an error message is shown on the OTP field

#### Scenario: OTP_INVALID / OTP_USED shows inline error
- **WHEN** the API returns `OTP_INVALID` or `OTP_USED`
- **THEN** an error message is shown on the OTP field

#### Scenario: Mismatched new passwords blocked client-side
- **WHEN** New Password and Confirm Password differ
- **THEN** a `FormMessage` appears on the Confirm Password field; no API call is made

---

### Requirement: Shared AuthLayout wraps all auth pages

All four auth pages (login, register, forgot-password, reset-password) SHALL be wrapped in `AuthLayout`, which renders a centered card. The card MUST be the only content on the page (no app shell, no sidebar).

#### Scenario: Auth page renders inside centered card
- **WHEN** any auth route is visited
- **THEN** the page content is rendered inside a centered card container with no navigation sidebar
