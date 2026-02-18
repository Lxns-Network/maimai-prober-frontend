import { RouteGuard } from '@/components/RouteGuard';
import Info from '@/pages/developer/Info';

export default function Page() {
	return (
		<RouteGuard>
			<Info />
		</RouteGuard>
	);
}
