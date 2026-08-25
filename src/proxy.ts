import { NextResponse, type NextRequest } from "next/server";

import { getR2Addressing } from "@/config/r2-addressing";
import { getServerEnv } from "@/config/env.server.runtime";
import { refreshStaffSession } from "@/infrastructure/supabase/proxy";

function r2UploadOrigin(): string | null {
  const r2 = getServerEnv().R2;
  if (!r2) return null;
  return getR2Addressing(r2)?.uploadOrigin ?? null;
}

function createContentSecurityPolicy(nonce: string, pathname: string): string {
  const uploadOrigin = pathname.startsWith("/admin") ? r2UploadOrigin() : null;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "img-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self'${uploadOrigin ? ` ${uploadOrigin}` : ""}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    request.nextUrl.pathname,
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  const response = request.nextUrl.pathname.startsWith("/admin")
    ? await refreshStaffSession(request, requestHeaders)
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
