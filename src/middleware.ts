import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/app", "/platform", "/school", "/student", "/register-school"];
const AUTH_PAGES = ["/login", "/register"];

const isProtected = (pathname: string) => PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session cookie and keeps signed-out visitors out of signed-in areas.
 * Authorisation is NOT decided here: pages check permissions server-side and RLS filters every query.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  if (!url || !anonKey) {
    if (isProtected(pathname)) return NextResponse.redirect(new URL("/setup", request.url));
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  if (user && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
