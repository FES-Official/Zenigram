import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  createCollection,
  getPost,
  getUserById,
  listCollections,
  updateCollectionPost,
} from "@/app/lib/socialStore";

function jsonOk(data = {}, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const user = await getUserById(session.user.id);
    if (!user) return jsonError("User not found", 404);
    const collections = await listCollections(session.user.id);
    return jsonOk({ collections });
  } catch (error) {
    console.error("Saved collections fetch error:", error);
    return jsonError("Failed to load saved collections", 500);
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const { name } = await req.json();
    const cleanName = normalizeString(name).slice(0, 40);
    if (!cleanName) return jsonError("Collection name is required", 400);

    const user = await getUserById(session.user.id);
    if (!user) return jsonError("User not found", 404);
    const collections = await createCollection(session.user.id, cleanName);
    return jsonOk({ collections }, 201);
  } catch (error) {
    console.error("Saved collection create error:", error);
    return jsonError("Failed to create collection", 500);
  }
}

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const { collectionId, postId, action = "add" } = await req.json();
    if (!collectionId || !postId) {
      return jsonError("Collection and post are required", 400);
    }

    if (action !== "remove" && !(await getPost(postId))) {
      return jsonError("Post not found", 404);
    }
    const collections = await updateCollectionPost(
      session.user.id,
      collectionId,
      postId,
      action,
    );
    if (!collections) return jsonError("Collection not found", 404);
    return jsonOk({ collections });
  } catch (error) {
    console.error("Saved collection update error:", error);
    return jsonError("Failed to update collection", 500);
  }
}
