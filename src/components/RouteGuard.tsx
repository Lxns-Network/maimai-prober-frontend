import { navigate } from 'vike/client/router';
import { isTokenUndefined, isTokenExpired, checkPermission, UserPermission } from '@/utils/session';
import { useUserToken } from '@/hooks/swr/useUserToken';
import { useEffect, useState } from 'react';

interface GuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RouteGuard({ children, requireAdmin = false }: GuardProps) {
  const { mutate } = useUserToken();
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
      mutate();
    }

    if (requireAdmin && !checkPermission(UserPermission.Administrator)) {
      navigate('/');
      return;
    }

    setIsAllowed(true);
    setIsChecking(false);
  }, [mutate, requireAdmin]);

  if (isChecking) {
    return null;
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
