import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { LoginSchema } from 'shared';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { useAuth, mapAuthError } from '../../hooks/useAuth.js';
import { useAuthStore } from '../../store/authStore.js';

type LoginFormValues = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = (data: LoginFormValues) => {
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
    <AuthLayout title="Sign in">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {errors.root && (
          <p className="text-sm text-red-600">{errors.root.message}</p>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@example.com"
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            {...register('password')}
            type="password"
            placeholder="••••••••"
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <Link
          to="/forgot-password"
          className="text-center text-sm text-blue-600 hover:underline"
        >
          Forgot password?
        </Link>
        <p className="text-center text-sm text-gray-500">
          No account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
