import type { NextRequest } from "next/server";

import { refreshStaffSession } from "@/infrastructure/supabase/proxy";

export async function proxy(request: NextRequest) {
  return refreshStaffSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
