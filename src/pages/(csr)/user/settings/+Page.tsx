import { RouteGuard } from '@/components/RouteGuard';
import Settings from '@/pages/user/Settings';

export default function Page() {
  return (
    <RouteGuard>
      <Settings />
    </RouteGuard>
  );
}
