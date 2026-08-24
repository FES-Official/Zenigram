import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getS3Config } from "@/app/lib/s3Storage";

export async function GET() {
  const hasAuthSecret = Boolean(process.env.NEXTAUTH_SECRET);
  const hasS3 = Boolean(getS3Config());

  if (!hasAuthSecret || !hasS3) {
    return Response.json(
      { ok: false, timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  try {
    await getDynamoDocumentClient().send(
      new GetCommand({
        TableName: getDynamoTableName(),
        Key: { PK: "__health__", SK: "__health__" },
        ConsistentRead: false,
      }),
    );

    return Response.json(
      { ok: true, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    console.error("Health check dependency failure:", error);
    return Response.json(
      {
        ok: false,
        message: "Service dependencies are unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
