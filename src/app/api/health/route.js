import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getS3Config } from "@/app/lib/s3Storage";

export async function GET() {
  const checks = {
    env: Boolean(process.env.NEXTAUTH_SECRET),
    dynamodb: false,
    s3: Boolean(getS3Config()),
  };

  try {
    if (!checks.env) {
      return Response.json(
        { ok: false, checks, timestamp: new Date().toISOString() },
        { status: 503 },
      );
    }

    const client = getDynamoDocumentClient();
    const table = getDynamoTableName();
    await client.send(
      new GetCommand({
        TableName: table,
        Key: { PK: "__health__", SK: "__health__" },
      }),
    );
    checks.dynamodb = true;

    const ok = checks.env && checks.dynamodb && checks.s3;
    return Response.json(
      {
        ok,
        checks,
        timestamp: new Date().toISOString(),
      },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    console.error("Health check error:", error);
    return Response.json(
      {
        ok: false,
        checks,
        message: "One or more production dependencies are unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
