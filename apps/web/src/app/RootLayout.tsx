import { Outlet } from 'react-router-dom';

import { AuthProvider } from './auth';

export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
