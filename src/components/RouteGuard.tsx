import { navigate } from 'vike/client/router';
import { isTokenUndefined, isTokenExpired, checkPermission, UserPermission } from '@/utils/session';
import { useUserToken } from '@/hooks/queries/useUserToken.ts';
import { useEffect, useState } from 'react';

interface GuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RouteGuard({ children, requireAdmin = false }: GuardProps) {
  const { refetch } = useUserToken();
  const [isChecking, setIsChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsChecking(false);
      return;
    }

    if (isTokenUndefined()) {
      const redirectPath = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?redirect=${redirectPath}`);
      return;
    }

    if (isTokenExpired()) {
      refetch();
    }

    if (requireAdmin && !checkPermission(UserPermission.Administrator)) {
      navigate('/');
      return;
    }

    setIsAllowed(true);
    setIsChecking(false);
  }, [refetch, requireAdmin]);

  if (isChecking) {
    return null;
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
