import nextEnv from "@next/env";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const {
  AWS_DYNAMODB_REGION,
  AWS_REGION,
  AWS_S3_REGION,
  AWS_BUCKET_NAME,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  DYNAMODB_TABLE_NAME,
  NEXTAUTH_URL,
} = process.env;

const dynamodbRegion = AWS_DYNAMODB_REGION || AWS_REGION;

if (!dynamodbRegion || !AWS_BUCKET_NAME || !DYNAMODB_TABLE_NAME) {
  throw new Error(
    "A DynamoDB region, AWS_BUCKET_NAME, and DYNAMODB_TABLE_NAME are required",
  );
}

const credentials =
  AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      }
    : undefined;
const dynamo = new DynamoDBClient({ region: dynamodbRegion, credentials });
const s3 = new S3Client({ region: AWS_S3_REGION || AWS_REGION, credentials });

let tableExists = true;
try {
  await dynamo.send(new DescribeTableCommand({ TableName: DYNAMODB_TABLE_NAME }));
} catch (error) {
  if (error.name !== "ResourceNotFoundException") throw error;
  tableExists = false;
}

if (!tableExists) {
  await dynamo.send(
    new CreateTableCommand({
      TableName: DYNAMODB_TABLE_NAME,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
        { AttributeName: "GSI2PK", AttributeType: "S" },
        { AttributeName: "GSI2SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "GSI2",
          KeySchema: [
            { AttributeName: "GSI2PK", KeyType: "HASH" },
            { AttributeName: "GSI2SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      SSESpecification: { Enabled: true },
      Tags: [
        { Key: "Application", Value: "Linkex" },
        { Key: "ManagedBy", Value: "setup-aws-storage" },
      ],
    }),
  );
  await waitUntilTableExists(
    { client: dynamo, maxWaitTime: 300 },
    { TableName: DYNAMODB_TABLE_NAME },
  );
  console.log(`Created DynamoDB table ${DYNAMODB_TABLE_NAME}.`);
} else {
  console.log(`DynamoDB table ${DYNAMODB_TABLE_NAME} already exists.`);
}

await s3.send(new HeadBucketCommand({ Bucket: AWS_BUCKET_NAME }));

const origin = (() => {
  try {
    return new URL(NEXTAUTH_URL || "http://localhost:7860").origin;
  } catch {
    return "http://localhost:7860";
  }
})();

let corsRules = [];
try {
  corsRules =
    (
      await s3.send(new GetBucketCorsCommand({ Bucket: AWS_BUCKET_NAME }))
    ).CORSRules || [];
} catch (error) {
  if (!["NoSuchCORSConfiguration", "NoSuchCORSConfigurationException"].includes(error.name)) {
    throw error;
  }
}
const linkexCors = {
  ID: "linkex-direct-browser-uploads",
  AllowedOrigins: [...new Set([origin, "http://localhost:7860"])],
  AllowedMethods: ["GET", "HEAD", "PUT"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag", "x-amz-checksum-crc32", "x-amz-request-id"],
  MaxAgeSeconds: 3600,
};
await s3.send(
  new PutBucketCorsCommand({
    Bucket: AWS_BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        ...corsRules.filter((rule) => rule.ID !== linkexCors.ID),
        linkexCors,
      ],
    },
  }),
);

let lifecycleRules = [];
try {
  lifecycleRules =
    (
      await s3.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: AWS_BUCKET_NAME }),
      )
    ).Rules || [];
} catch (error) {
  if (!["NoSuchLifecycleConfiguration", "NoSuchLifecycleConfigurationException"].includes(error.name)) {
    throw error;
  }
}
const multipartCleanup = {
  ID: "linkex-abort-incomplete-multipart",
  Status: "Enabled",
  Filter: { Prefix: "media/" },
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
};
await s3.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: AWS_BUCKET_NAME,
    LifecycleConfiguration: {
      Rules: [
        ...lifecycleRules.filter((rule) => rule.ID !== multipartCleanup.ID),
        multipartCleanup,
      ],
    },
  }),
);

console.log(`Configured direct-upload CORS and multipart cleanup on ${AWS_BUCKET_NAME}.`);
