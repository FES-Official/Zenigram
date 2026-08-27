import { getServerSession } from "next-auth";
import { BatchGetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { authOptions } from "@/app/lib/auth";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getReadableMediaUrl } from "@/app/lib/s3Storage";
import { getUserById, getUserRelations } from "@/app/lib/socialStore";

const table = () => getDynamoTableName();
const client = () => getDynamoDocumentClient();

function clean(item) {
  if (!item) return null;
  const value = { ...item };
  delete value.PK;
  delete value.SK;
  return value;
}

async function batchGet(keys) {
  if (!keys.length) return [];
  const output = [];
  for (let index = 0; index < keys.length; index += 100) {
    let requestKeys = keys.slice(index, index + 100);
    do {
      const result = await client().send(new BatchGetCommand({
        RequestItems: { [table()]: { Keys: requestKeys } },
      }));
      output.push(...(result.Responses?.[table()] || []));
      requestKeys = result.UnprocessedKeys?.[table()]?.Keys || [];
    } while (requestKeys.length);
  }
  return output;
}

async function hydrateClip(clip, viewerId, savedAt, viewerRelations) {
  const mediaItems = await Promise.all(
    (clip.mediaItems?.length
      ? clip.mediaItems
      : [{ key: clip.mediaPublicId, url: clip.mediaUrl, type: clip.mediaType }]
    ).map(async (media) => ({
      ...media,
      url: await getReadableMediaUrl(media.url, media.key || media.publicId),
    })),
  );
  const user = await getUserById(clip.userId);
  const blocked = new Set([
    ...(viewerRelations.blockedUsers || []),
    ...(viewerRelations.blockedByUsers || []),
  ].map(String));

  if (!user || user.accountStatus !== "active") return null;
  if (blocked.has(String(clip.userId))) return null;
  if (user.ishidden && !viewerRelations.supporting?.map(String).includes(String(clip.userId)) && String(clip.userId) !== String(viewerId)) {
    return null;
  }

  return {
    ...clip,
    mediaItems,
    mediaUrl: mediaItems[0]?.url || await getReadableMediaUrl(clip.mediaUrl, clip.mediaPublicId),
    user,
    viewerSaved: true,
    savedAt,
    viewerLiked: (clip.likes || []).includes(viewerId),
    viewerViewed: (clip.views || []).includes(viewerId),
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const viewerId = session.user.id;
    const [savedResult, viewerRelations] = await Promise.all([
      client().send(new QueryCommand({
        TableName: table(),
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${viewerId}`,
          ":prefix": "SAVED_CLIP#",
        },
        ScanIndexForward: false,
        Limit: 200,
      })),
      getUserRelations(viewerId),
    ]);

    const saved = (savedResult.Items || []).map(clean);
    const clipIds = [...new Set(saved.map((item) => item.clipId).filter(Boolean))];
    const clips = await batchGet(clipIds.map((clipId) => ({ PK: `CLIP#${clipId}`, SK: "META" })));
    const clipMap = new Map(clips.map((item) => [String(item._id), clean(item)]));

    const hydrated = (
      await Promise.all(
        saved
          .map((savedItem) => ({ clip: clipMap.get(String(savedItem.clipId)), savedAt: savedItem.createdAt }))
          .filter((item) => item.clip && item.clip.entityType === "clip")
          .map((item) => hydrateClip(item.clip, viewerId, item.savedAt, viewerRelations)),
      )
    ).filter(Boolean);

    return Response.json({ success: true, clips: hydrated });
  } catch (error) {
    console.error("Saved clips fetch error:", error);
    return Response.json({ success: false, message: "Failed to load saved clips" }, { status: 500 });
  }
}
