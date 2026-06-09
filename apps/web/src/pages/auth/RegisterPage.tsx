import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { RegisterSchema } from 'shared';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { useAuth, mapAuthError } from '../../hooks/useAuth.js';
import { useAuthStore } from '../../store/authStore.js';

const RegisterFormSchema = RegisterSchema.extend({
  confirmPassword: z.string(),
}).superRefine(({ password, confirmPassword }, ctx) => {
  if (password !== confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match.',
    });
  }
});

type RegisterFormValues = z.infer<typeof RegisterFormSchema>;

const inputClass =
  'rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export default function RegisterPage() {
  const { register: registerMutation } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(RegisterFormSchema) });

  const onSubmit = ({ email, password }: RegisterFormValues) => {
    registerMutation.mutate(
      { email, password },
      {
        onSuccess: (res) => {
          useAuthStore.getState().setAccessToken(res.accessToken);
          navigate('/notes');
        },
        onError: (err) => {
          const { field, message } = mapAuthError(err);
          setError(field as keyof RegisterFormValues | 'root', { message });
        },
      }
    );
  };

  return (
    <AuthLayout title="Create an account">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {errors.root && (
          <p className="text-sm text-red-600">{errors.root.message}</p>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@example.com"
            className={inputClass}
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">Password</label>
          <input
            {...register('password')}
            type="password"
            placeholder="••••••••"
            className={inputClass}
          />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">
            Confirm password
          </label>
          <input
            {...register('confirmPassword')}
            type="password"
            placeholder="••••••••"
            className={inputClass}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-600">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {registerMutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
