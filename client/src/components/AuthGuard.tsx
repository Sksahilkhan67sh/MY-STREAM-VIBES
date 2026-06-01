// Stub — authentication is now handled by NextAuth (next-auth/react)
// This file exists only to prevent import errors from any remaining references.
// You can safely delete this file once all imports are removed.
'use client';
import { ReactNode } from 'react';

export function useAuth() {
  return { isAuthed: true, logout: () => {} };
}

export function AuthGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
