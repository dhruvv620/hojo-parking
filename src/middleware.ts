import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the login session fresh and sends anyone who is not logged in to /login.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // The guest check-in page is public (it only works with the secret code from the QR sign).
  if (request.nextUrl.pathname === "/checkin") return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (request.nextUrl.pathname === "/setup") return response;
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

  if (!user && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  // Skip the login check for static files and the lot pictures (guests need to see them).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|maps/|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
