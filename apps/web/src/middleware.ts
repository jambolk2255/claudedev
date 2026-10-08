import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createIntlMiddleware(routing);

const PUBLIC_PATHS = [/^\/login$/, /^\/register$/, /^\/invite\/[^/]+$/];

/** `sf_csrf` lives as long as the refresh token, so it is a cheap "probably signed in" hint. */
const SESSION_HINT_COOKIE = "sf_csrf";

function stripLocale(pathname: string): { locale: string | null; path: string } {
  const match = pathname.match(/^\/(si|en)(\/.*)?$/);
  return match ? { locale: match[1]!, path: match[2] ?? "/" } : { locale: null, path: pathname };
}

export default function middleware(req: NextRequest) {
  const { locale, path } = stripLocale(req.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.some((re) => re.test(path));
  const hasSession = req.cookies.has(SESSION_HINT_COOKIE);

  if (!isPublic && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = `${locale && locale !== routing.defaultLocale ? `/${locale}` : ""}/login`;
    url.search = path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
    return NextResponse.redirect(url);
  }
  return intl(req);
}

export const config = {
  // Skip API proxy, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
