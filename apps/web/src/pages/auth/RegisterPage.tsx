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
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Confirm password
          </label>
          <input
            {...register('confirmPassword')}
            type="password"
            placeholder="••••••••"
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {registerMutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
