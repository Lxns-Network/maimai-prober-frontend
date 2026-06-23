import { RouteGuard } from "@/components/RouteGuard";
import Notifications from "@/pages/notifications/Notifications";

export default function Page() {
  return (
    <RouteGuard>
      <Notifications />
    </RouteGuard>
  );
}
