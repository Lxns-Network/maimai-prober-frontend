import { RouteGuard } from '@/components/RouteGuard';
import Profile from '@/pages/user/Profile/Profile';

export default function Page() {
  return (
    <RouteGuard>
      <Profile />
    </RouteGuard>
  );
}
