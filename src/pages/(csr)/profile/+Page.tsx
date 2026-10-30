import { RouteGuard } from "@/components/RouteGuard";
import FriendProfile from "@/pages/user/FriendProfile";

export default function Page() {
  return (
    <RouteGuard>
      <FriendProfile />
    </RouteGuard>
  );
}
