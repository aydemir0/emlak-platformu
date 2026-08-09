import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/config/env.client";
import type { Database } from "@/types/database.generated";

export async function refreshStaffSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();
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
          response = NextResponse.next({ request });
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
