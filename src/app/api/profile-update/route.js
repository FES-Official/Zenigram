import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { deleteS3Objects, verifyS3Object } from "@/app/lib/s3Storage";
import {
  getUserById,
  getUserByUsername,
  updateUser,
} from "@/app/lib/socialStore";
import {
  consumeVerifiedPhoneUpdate,
  hasVerifiedPhoneUpdate,
  normalizeE164Phone,
} from "@/app/lib/verification";

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);

    const data = await req.json();
    const username = normalizeString(data.username).toLowerCase();
    const bio = normalizeString(data.bio);
    const website = normalizeString(data.website);
    const gender = normalizeString(data.gender);
    const mobile = normalizeString(data.mobile);
    const currentUser = await getUserById(userId);
    if (!currentUser) return jsonError("User not found", 404);

    if (!/^[a-z0-9._]{3,24}$/.test(username)) {
      return jsonError("Enter a valid username", 400);
    }
    if (bio.length > 300) return jsonError("Bio is too long", 400);
    const mobileChanged = mobile !== String(currentUser.mobile || "");
    if (mobileChanged && mobile && !normalizeE164Phone(mobile)) {
      return jsonError(
        "Use international phone format with country code, e.g. +919876543210.",
        400,
      );
    }
    if (
      mobileChanged &&
      mobile &&
      !(await hasVerifiedPhoneUpdate(userId, mobile))
    ) {
      return jsonError("Verify your new phone number before saving it.", 403);
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
    if (duplicate && duplicate._id !== userId) {
      return jsonError("Username is already taken", 409);
    }

    if (data.profilePicKey) {
      const uploaded = await verifyS3Object(data.profilePicKey, userId);
      if (!uploaded?.contentType.startsWith("image/")) {
        return jsonError("Invalid profile image", 400);
      }
      data.verifiedProfilePic = uploaded.url;
      data.verifiedProfilePicKey = uploaded.key;
    }

    if (mobileChanged && mobile) {
      const consumed = await consumeVerifiedPhoneUpdate(userId, mobile);
      if (!consumed) {
        return jsonError("Your phone verification has expired. Please verify the number again.", 403);
      }
    }

    const user = await updateUser(userId, {
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
