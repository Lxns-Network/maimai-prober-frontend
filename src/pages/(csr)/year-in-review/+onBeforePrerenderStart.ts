import { SUPPORTED_YEARS } from './config';

export function onBeforePrerenderStart() {
  return SUPPORTED_YEARS.map(year => `/year-in-review/${year}`);
}
