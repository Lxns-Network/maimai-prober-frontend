import { useEffect } from 'react';
import { useLocation } from "react-router"
import { NavigationProgress, nprogress } from '@mantine/nprogress';

export default function RouterTransition() {
  const location = useLocation();

  useEffect(() => {
    return () => {
      nprogress.start();
      nprogress.complete();
    };
  }, [location.pathname])

  return <NavigationProgress />;
}