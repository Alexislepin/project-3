import { ReactNode, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoginPage } from '../pages/Login';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // Diagnostic: logs mount/unmount
  useEffect(() => {
    console.log('[MOUNT]', 'ProtectedRoute');
    return () => console.log('[UNMOUNT]', 'ProtectedRoute');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center">
        <div className="text-text-sub-light">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

