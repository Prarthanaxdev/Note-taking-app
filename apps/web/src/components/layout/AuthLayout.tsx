import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
}

export function AuthLayout({ children, title }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-md">
        <h1 className="mb-6 text-2xl font-bold text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  );
}
