import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getUserById, getUserRelations } from "@/app/lib/socialStore";
import { getReadableMediaUrl, hydrateMediaItem, hydrateUserMedia } from "@/app/lib/s3Storage";

const INDEX_NAME = process.env.DYNAMODB_GSI_NAME || "GSI1";
const PAGE_SIZE = 100;
const MAX_RESULTS = 80;

export async function listProfileClips(ownerId, viewerId = "") {
  const relations = viewerId
    ? await getUserRelations(viewerId)
    : { supporting: [], blockedUsers: [], blockedByUsers: [], savedClips: [] };
  const blocked = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ]);

  const owner = await getUserById(ownerId);
  if (!owner || owner.accountStatus !== "active" || blocked.has(ownerId)) return [];
  if (
    owner.ishidden &&
    String(ownerId) !== String(viewerId) &&
    !(relations.supporting || []).includes(ownerId)
  ) {
    return [];
  }

  const clips = [];
  let ExclusiveStartKey;
  do {
    const result = await getDynamoDocumentClient().send(new QueryCommand({
      TableName: getDynamoTableName(),
      IndexName: INDEX_NAME,
      KeyConditionExpression: "GSI1PK = :feed",
      FilterExpression: "userId = :owner",
      ExpressionAttributeValues: { ":feed": "FEED#CLIPS", ":owner": ownerId },
      ScanIndexForward: false,
      Limit: PAGE_SIZE,
      ExclusiveStartKey,
    }));
    clips.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey && clips.length < MAX_RESULTS);

  const hydratedOwner = await hydrateUserMedia(owner);
  return Promise.all(clips.slice(0, MAX_RESULTS).map(async (clip) => ({
    ...clip,
    PK: undefined,
    SK: undefined,
    GSI1PK: undefined,
    GSI1SK: undefined,
    mediaItems: await Promise.all((clip.mediaItems || []).map(hydrateMediaItem)),
    mediaUrl: await getReadableMediaUrl(clip.mediaUrl, clip.mediaPublicId),
    user: hydratedOwner,
    viewerLiked: (clip.likes || []).includes(viewerId),
    viewerViewed: (clip.views || []).includes(viewerId),
    viewerSaved: (relations.savedClips || []).includes(clip._id),
  })));
}
