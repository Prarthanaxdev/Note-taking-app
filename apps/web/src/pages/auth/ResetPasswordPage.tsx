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

const inputClass =
  'rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

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
          <label className="text-sm font-medium text-foreground">
            Reset code
          </label>
          <input
            {...register('otp')}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className={`${inputClass} tracking-widest`}
          />
          {errors.otp && (
            <p className="text-sm text-red-600">{errors.otp.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">
            New password
          </label>
          <input
            {...register('newPassword')}
            type="password"
            placeholder="••••••••"
            className={inputClass}
          />
          {errors.newPassword && (
            <p className="text-sm text-red-600">{errors.newPassword.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">
            Confirm new password
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
          disabled={resetPassword.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {resetPassword.isPending ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
