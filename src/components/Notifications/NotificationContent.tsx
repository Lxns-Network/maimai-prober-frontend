import { lazy, Suspense } from "react";

// Kept lazy so remark-gfm stays out of the boot graph: it ships a lookbehind regex that fails to
// parse on Safari < 16.4, which would abort the whole module graph and block hydration.
const NotificationMarkdown = lazy(() => import("./NotificationMarkdown.tsx"));

export function NotificationContent({ content }: { content: string }) {
  return (
    <Suspense fallback={null}>
      <NotificationMarkdown content={content} />
    </Suspense>
  );
}
