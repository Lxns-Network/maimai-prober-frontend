import { RouteGuard } from '@/components/RouteGuard';
import Apply from '@/pages/developer/Apply';

export default function Page() {
  return (
    <RouteGuard>
      <Apply />
    </RouteGuard>
  );
}
