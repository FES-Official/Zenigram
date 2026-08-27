import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getPost, getUserById, getUserRelations } from "@/app/lib/socialStore";
import { canViewContent } from "@/app/lib/audienceStore";
import { hydratePostMedia } from "@/app/lib/s3Storage";

const client = () => getDynamoDocumentClient();
const table = () => getDynamoTableName();

export async function getSafePostForViewer(postId, viewerId) {
  if (!postId || !viewerId) return null;
  const post = await getPost(postId);
  if (!post) return null;

  const [owner, relations] = await Promise.all([
    getUserById(post.userId),
    getUserRelations(viewerId),
  ]);
  if (!owner || owner.accountStatus !== "active") return null;
  if (!(await canViewContent(post, viewerId, owner, relations))) return null;

  const [hydrated, like, saved] = await Promise.all([
    hydratePostMedia(post),
    client().send(new GetCommand({ TableName: table(), Key: { PK: `POST#${postId}`, SK: `LIKE#${viewerId}` } })),
    client().send(new GetCommand({ TableName: table(), Key: { PK: `USER#${viewerId}`, SK: `SAVED#${postId}` } })),
  ]);

  return {
    ...hydrated,
    user: owner,
    likes: like.Item ? [viewerId] : [],
    viewerLiked: Boolean(like.Item),
    viewerSaved: Boolean(saved.Item),
  };
}
