import { RouteGuard } from '@/components/RouteGuard';
import Settings from '@/pages/admin/Settings';

export default function Page() {
  return (
    <RouteGuard requireAdmin>
      <Settings />
    </RouteGuard>
  );
}
