import { RouteGuard } from '@/components/RouteGuard';
import Panel from '@/pages/admin/Panel';

export default function Page() {
  return (
    <RouteGuard requireAdmin>
      <Panel />
    </RouteGuard>
  );
}
