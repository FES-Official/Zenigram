import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { deleteS3Objects, verifyS3Object } from "@/app/lib/s3Storage";
import {
  getUserById,
  getUserByUsername,
  updateUser,
} from "@/app/lib/socialStore";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const data = await req.json();
    const username = normalizeString(data.username).toLowerCase();
    const bio = normalizeString(data.bio);
    const website = normalizeString(data.website);
    const gender = normalizeString(data.gender);
    const mobile = normalizeString(data.mobile);
    const currentUser = await getUserById(session.user.id);
    if (!currentUser) return jsonError("User not found", 404);

    if (!/^[a-z0-9._]{3,24}$/.test(username)) {
      return jsonError("Enter a valid username", 400);
    }
    if (bio.length > 300) return jsonError("Bio is too long", 400);
    if (mobile && !/^[0-9]{10,15}$/.test(mobile)) {
      return jsonError("Enter a valid mobile number", 400);
    }
    if (website) {
      try {
        const url = new URL(website);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        return jsonError("Enter a valid website URL", 400);
      }
    }

    const duplicate = await getUserByUsername(username);
    if (duplicate && duplicate._id !== session.user.id) {
      return jsonError("Username is already taken", 409);
    }

    if (data.profilePicKey) {
      const uploaded = await verifyS3Object(data.profilePicKey, session.user.id);
      if (!uploaded?.contentType.startsWith("image/")) {
        return jsonError("Invalid profile image", 400);
      }
      data.verifiedProfilePic = uploaded.url;
      data.verifiedProfilePicKey = uploaded.key;
    }

    const user = await updateUser(session.user.id, {
      username,
      bio,
      website,
      gender,
      mobile,
      ishidden: Boolean(data.ishidden),
      ...(data.verifiedProfilePic
        ? {
            profilePic: data.verifiedProfilePic,
            profilePicKey: data.verifiedProfilePicKey,
          }
        : {}),
    });

    if (!user) return jsonError("User not found", 404);

    if (
      data.verifiedProfilePicKey &&
      currentUser.profilePicKey &&
      currentUser.profilePicKey !== data.verifiedProfilePicKey
    ) {
      await deleteS3Objects([currentUser.profilePicKey]).catch((deleteError) => {
        console.error("Old profile image cleanup failed:", deleteError);
      });
    }

    const hydratedUser = await getUserById(user._id);
    return jsonOk({
      username: hydratedUser.username,
      user: {
        username: hydratedUser.username,
        bio: hydratedUser.bio || "",
        website: hydratedUser.website || "",
        gender: hydratedUser.gender || "",
        mobile: hydratedUser.mobile || "",
        ishidden: Boolean(hydratedUser.ishidden),
        profilePic: hydratedUser.profilePic || "",
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return jsonError("Profile update failed", 500);
  }
}
