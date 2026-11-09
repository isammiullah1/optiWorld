import React, { createContext, useContext, useState } from 'react';
import type { AuthSessionUser } from '@optiworld/shared';

import { logout, restoreSession } from '../services/auth-service';

type SessionValue = {
  user: AuthSessionUser | null;
  ready: boolean;
  signIn: (user: AuthSessionUser) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [ready, setReady] = useState(false);

  React.useEffect(() => {
    void restoreSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value: SessionValue = {
    user,
    ready,
    signIn: setUser,
    signOut: async () => {
      try {
        await logout();
      } catch {
        // Leave the signed-in screens even if the server cannot be reached.
      }
      setUser(null);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionValue(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('Sign in is required');
  }
  return value;
}

export function useSignedInUser(): AuthSessionUser {
  const user = useSessionValue().user;
  if (!user) {
    throw new Error('Sign in is required');
  }
  return user;
}
