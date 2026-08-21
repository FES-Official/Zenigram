import NextAuth from "next-auth";
import { authOptions } from "@/app/lib/auth";

// Authentication must always run on the server. Explicitly opting out of
// static handling keeps Next.js from caching or pre-rendering this catch-all
// route when production output is generated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
