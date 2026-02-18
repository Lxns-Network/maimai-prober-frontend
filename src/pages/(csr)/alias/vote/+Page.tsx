import { RouteGuard } from '@/components/RouteGuard';
import Vote from '@/pages/alias/Vote';

export default function Page() {
  return (
    <RouteGuard>
      <Vote />
    </RouteGuard>
  );
}
