import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getServerPublicEnv } from "@/config/env.server.runtime";
import type { Database } from "@/types/database.generated";

export async function refreshStaffSession(
  request: NextRequest,
  requestHeaders: Headers = request.headers,
) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const env = getServerPublicEnv();
  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}
