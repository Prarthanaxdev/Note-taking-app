import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ResetPasswordSchema } from 'shared';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { useAuth, mapAuthError } from '../../hooks/useAuth.js';

const ResetFormSchema = ResetPasswordSchema.extend({
  confirmPassword: z.string(),
}).superRefine(({ newPassword, confirmPassword }, ctx) => {
  if (newPassword !== confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Passwords do not match.',
    });
  }
});

type ResetFormValues = z.infer<typeof ResetFormSchema>;

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetFormValues>({ resolver: zodResolver(ResetFormSchema) });

  const onSubmit = ({ email, otp, newPassword }: ResetFormValues) => {
    resetPassword.mutate(
      { email, otp, newPassword },
      {
        onSuccess: () => navigate('/login'),
        onError: (err) => {
          const { field, message } = mapAuthError(err);
          setError(field as keyof ResetFormValues | 'root', { message });
        },
      }
    );
  };

  return (
    <AuthLayout title="Reset password">
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
          <label className="text-sm font-medium text-gray-700">
            Reset code
          </label>
          <input
            {...register('otp')}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className="rounded-md border px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.otp && (
            <p className="text-sm text-red-600">{errors.otp.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            New password
          </label>
          <input
            {...register('newPassword')}
            type="password"
            placeholder="••••••••"
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.newPassword && (
            <p className="text-sm text-red-600">{errors.newPassword.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Confirm new password
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
          disabled={resetPassword.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {resetPassword.isPending ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
