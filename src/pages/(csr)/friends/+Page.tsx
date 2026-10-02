import { RouteGuard } from "@/components/RouteGuard";
import Friends from "@/pages/user/Friends";

export default function Page() {
  return (
    <RouteGuard>
      <Friends />
    </RouteGuard>
  );
}
