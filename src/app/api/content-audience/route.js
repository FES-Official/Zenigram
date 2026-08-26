import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/app/lib/auth";

const COOKIE_MAX_AGE = 60 * 60 * 2;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const target = body.target === "clip" ? "clip" : "post";
  const closeOnesOnly = Boolean(body.closeOnesOnly);
  const name = target === "clip" ? "zenigram_clip_audience" : "zenigram_post_audience";
  const store = await cookies();
  store.set(name, closeOnesOnly ? "close" : "all", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: target === "clip" ? "/create-clip" : "/create-post",
    maxAge: COOKIE_MAX_AGE,
  });
  return Response.json({ success: true, target, closeOnesOnly });
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const target = new URL(req.url).searchParams.get("target") === "clip" ? "clip" : "post";
  const name = target === "clip" ? "zenigram_clip_audience" : "zenigram_post_audience";
  const store = await cookies();
  store.delete(name);
  return Response.json({ success: true });
}
