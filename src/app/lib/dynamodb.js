import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let documentClient;

export function getDynamoTableName() {
  const tableName = process.env.DYNAMODB_TABLE_NAME?.trim();
  if (!tableName) {
    throw new Error("DYNAMODB_TABLE_NAME is not configured");
  }
  return tableName;
}

export function getDynamoDocumentClient() {
  if (documentClient) return documentClient;
  const region = (
    process.env.AWS_DYNAMODB_REGION ||
    process.env.AWS_REGION
  )?.trim();
  if (!region) {
    throw new Error(
      "AWS_DYNAMODB_REGION or AWS_REGION must be configured",
    );
  }

  documentClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    }),
    {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
      },
    },
  );
  return documentClient;
}
