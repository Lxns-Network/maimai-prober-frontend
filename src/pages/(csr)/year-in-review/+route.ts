import { isSupportedYear } from './config';

export default function route(pageContext: { urlPathname: string }) {
  const { urlPathname } = pageContext;

  const match = urlPathname.match(/^\/year-in-review\/(\d{4})\/?$/);
  if (match) {
    const year = parseInt(match[1]);
    if (isSupportedYear(year)) {
      return { routeParams: { year: match[1] } };
    }
  }

  const shareMatch = urlPathname.match(/^\/year-in-review\/(\d{4})\/(.+?)\/?$/);
  if (shareMatch) {
    const year = parseInt(shareMatch[1]);
    if (isSupportedYear(year)) {
      return { routeParams: { year: shareMatch[1], '*': shareMatch[2] } };
    }
  }

  return false;
}
