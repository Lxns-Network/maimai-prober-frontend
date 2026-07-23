import { navigate } from "vike/client/router";
import { isTokenExpired, checkPermission, UserPermission } from "@/utils/session";
import { useUserToken } from "@/hooks/queries/useUserToken.ts";
import { useEffect, useState } from "react";
import { isAuthenticationRefreshError } from "@/utils/api/api.ts";

interface GuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RouteGuard({ children, requireAdmin = false }: GuardProps) {
  const { token, refetch } = useUserToken();
  const [isChecking, setIsChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [verificationError, setVerificationError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      if (typeof window === "undefined") {
        setIsChecking(false);
        return;
      }

      setIsChecking(true);
      setIsAllowed(false);
      setVerificationError(null);

      if (!token) {
        const redirectPath = encodeURIComponent(
          window.location.pathname + window.location.search + window.location.hash,
        );
        navigate(`/login?redirect=${redirectPath}`);
        return;
      }

      if (isTokenExpired()) {
        const result = await refetch();
        if (cancelled) return;
        if (result.error) {
          if (isAuthenticationRefreshError(result.error)) {
            const redirectPath = encodeURIComponent(
              window.location.pathname + window.location.search + window.location.hash,
            );
            navigate(`/login?redirect=${redirectPath}`);
          } else {
            setVerificationError(result.error);
            setIsChecking(false);
          }
          return;
        }
      }

      if (requireAdmin && !checkPermission(UserPermission.Administrator)) {
        navigate("/");
        return;
      }

      setIsAllowed(true);
      setIsChecking(false);
    };

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [refetch, requireAdmin, token]);

  if (verificationError) throw verificationError;

  if (isChecking) {
    return null;
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
