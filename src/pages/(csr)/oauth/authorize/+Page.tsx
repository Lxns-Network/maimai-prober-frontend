import { RouteGuard } from '@/components/RouteGuard';
import Authorize from '@/pages/user/OAuth/Authorize';

export default function Page() {
  return (
    <RouteGuard>
      <Authorize />
    </RouteGuard>
  );
}
