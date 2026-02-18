import { RouteGuard } from '@/components/RouteGuard';
import Scores from '@/pages/user/Scores';

export default function Page() {
  return (
    <RouteGuard>
      <Scores />
    </RouteGuard>
  );
}
