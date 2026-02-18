export default function route(pageContext: { urlPathname: string }) {
  const { urlPathname } = pageContext;

  if (urlPathname === '/docs' || urlPathname === '/docs/') {
    return { routeParams: { slug: 'index' } };
  }

  const match = urlPathname.match(/^\/docs\/(.+?)\/?$/);
  if (match) {
    const slug = match[1].replace(/\/$/, '');
    return { routeParams: { slug } };
  }

  return false;
}
