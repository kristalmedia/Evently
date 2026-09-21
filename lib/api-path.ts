// Next's `basePath` config (see next.config.ts) auto-prefixes <Link>,
// router.push/replace, and next/image, but NOT plain fetch() calls — those
// need the prefix added by hand. Set NEXT_PUBLIC_BASE_PATH to the same value
// as NEXT_BASE_PATH so this stays in sync at build time.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function apiPath(path: string): string {
  return `${BASE_PATH}${path}`;
}
