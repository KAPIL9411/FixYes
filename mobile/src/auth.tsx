import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, isConfigured, prepareSession } from './api';
import type { AuthUser } from './api/types';

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  beginGoogleSignIn: () => Promise<string>;
  signInWithGoogle: (credential: string, nonce: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(isConfigured);

  useEffect(() => {
    let active = true;
    if (!isConfigured) return;
    prepareSession()
      .then(() => api.getSessionUser())
      .then((session) => {
        if (active) setUser(session);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Re-check the stored session when the app returns to the foreground. The
  // server is the source of truth for expiry, roles and revocation.
  useEffect(() => {
    if (!isConfigured || !user) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      api
        .getSessionUser()
        .then((session) => {
          if (session) setUser(session);
          else {
            queryClient.clear();
            setUser(null);
          }
        })
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [queryClient, user]);

  const beginGoogleSignIn = useCallback(async () => api.beginGoogleSignIn(), []);

  const signInWithGoogle = useCallback(
    async (credential: string, nonce: string) => {
      const next = await api.signInWithGoogle(credential, nonce);
      queryClient.clear();
      setUser(next);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api.signOut();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const next = await api.getSessionUser();
    setUser(next);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, beginGoogleSignIn, signInWithGoogle, signOut, refresh }),
    [user, loading, beginGoogleSignIn, signInWithGoogle, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};
