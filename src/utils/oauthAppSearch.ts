import type { OAuthAppProps } from "@/types/developer";

export function filterOAuthApps(apps: OAuthAppProps[], search: string): OAuthAppProps[] {
  const query = search.trim().toLowerCase();
  if (!query) return apps;

  return apps.filter((app) =>
    [app.name, app.developer?.name, app.website, app.client_id, ...app.redirect_uris].some(
      (field) => field?.toLowerCase().includes(query),
    ),
  );
}
