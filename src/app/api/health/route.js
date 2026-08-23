import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getS3Config } from "@/app/lib/s3Storage";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export async function GET() {
  const checks = {
    env: true,
    dynamodb: false,
    s3: false,
  };

  try {
    if (!process.env.NEXTAUTH_SECRET) {
      return Response.json(
        { ok: false, checks: { ...checks, env: false } },
        { status: 503 },
      );
    }

    const s3 = getS3Config();
    checks.s3 = Boolean(s3);

    const client = getDynamoDocumentClient();
    const table = getDynamoTableName();
    await client.send(
      new GetCommand({
        TableName: table,
        Key: { PK: "__health__", SK: "__health__" },
      }),
    );
    checks.dynamodb = true;

    const session = await getServerSession(authOptions);
    return Response.json({
      ok: true,
      authenticated: Boolean(session?.user?.id),
      checks,
      timestamp: new Date().toISOString(),
    });
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
