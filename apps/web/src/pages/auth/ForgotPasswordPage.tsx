import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ForgotPasswordSchema } from 'shared';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { useAuth } from '../../hooks/useAuth.js';

type ForgotPasswordFormValues = z.infer<typeof ForgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  const onSubmit = (data: ForgotPasswordFormValues) => {
    forgotPassword.mutate(data, {
      onSuccess: () => setSubmitted(true),
      // Intentionally swallowed — never reveal whether the email is registered
      onError: () => setSubmitted(true),
    });
  };

  return (
    <AuthLayout title="Forgot password">
      {submitted ? (
        <p className="text-sm text-gray-700">
          If that email is registered, you'll receive a code shortly.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Enter your email and we'll send you a reset code.
          </p>
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
          <button
            type="submit"
            disabled={forgotPassword.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {forgotPassword.isPending ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
