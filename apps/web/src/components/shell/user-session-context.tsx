'use client';

import { createContext, useContext } from 'react';

const UserSessionContext = createContext<string | undefined>(undefined);

export function UserSessionProvider({
  userEmail,
  children,
}: {
  userEmail?: string | undefined;
  children: React.ReactNode;
}) {
  return <UserSessionContext.Provider value={userEmail}>{children}</UserSessionContext.Provider>;
}

/** The signed-in user's email, threaded down from the server layout. Undefined outside the dashboard shell. */
export function useUserEmail(): string | undefined {
  return useContext(UserSessionContext);
}
