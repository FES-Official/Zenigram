import nextEnv from "@next/env";
import { createHash } from "crypto";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : fallback;
}

const sourceRegion = argument("--source", "ap-southeast-2");
const targetRegion = argument(
  "--target",
  process.env.AWS_DYNAMODB_REGION || process.env.AWS_REGION,
);
const tableName = process.env.DYNAMODB_TABLE_NAME;
const replaceEmptyTarget = process.argv.includes("--replace-empty-target");

if (!sourceRegion || !targetRegion || !tableName) {
  throw new Error("Source region, target region, and table name are required");
}
if (sourceRegion === targetRegion) {
  throw new Error("Source and target DynamoDB regions must be different");
}

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

function clients(region) {
  const raw = new DynamoDBClient({ region, credentials });
  return {
    raw,
    document: DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    }),
  };
}

const source = clients(sourceRegion);
const target = clients(targetRegion);

async function describe(raw) {
  try {
    return (
      await raw.send(new DescribeTableCommand({ TableName: tableName }))
    ).Table;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") return null;
    throw error;
  }
}

async function scanAll(document) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await document.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey }),
    );
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function hasExpectedSchema(table) {
  const keySchema = new Map(
    (table?.KeySchema || []).map((item) => [item.AttributeName, item.KeyType]),
  );
  const indexes = new Map(
    (table?.GlobalSecondaryIndexes || []).map((index) => [
      index.IndexName,
      new Map(
        (index.KeySchema || []).map((item) => [
          item.AttributeName,
          item.KeyType,
        ]),
      ),
    ]),
  );

  return (
    keySchema.get("PK") === "HASH" &&
    keySchema.get("SK") === "RANGE" &&
    indexes.get("GSI1")?.get("GSI1PK") === "HASH" &&
    indexes.get("GSI1")?.get("GSI1SK") === "RANGE" &&
    indexes.get("GSI2")?.get("GSI2PK") === "HASH" &&
    indexes.get("GSI2")?.get("GSI2SK") === "RANGE"
  );
}

async function createTargetTable() {
  await target.raw.send(
    new CreateTableCommand({
      TableName: tableName,
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
        { Key: "DataRegion", Value: targetRegion },
        { Key: "ManagedBy", Value: "migrate-dynamodb-region" },
      ],
    }),
  );
  await waitUntilTableExists(
    { client: target.raw, maxWaitTime: 300 },
    { TableName: tableName },
  );
}

async function writeAll(items) {
  for (let offset = 0; offset < items.length; offset += 25) {
    let requests = items.slice(offset, offset + 25).map((Item) => ({
      PutRequest: { Item },
    }));
    do {
      const result = await target.document.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: requests },
        }),
      );
      requests = result.UnprocessedItems?.[tableName] || [];
    } while (requests.length);
  }
}

function stable(value) {
  if (value instanceof Set) return [...value].sort().map(stable);
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function checksum(items) {
  const ordered = [...items].sort((a, b) =>
    `${a.PK}\0${a.SK}`.localeCompare(`${b.PK}\0${b.SK}`),
  );
  return createHash("sha256")
    .update(JSON.stringify(stable(ordered)))
    .digest("hex");
}

const sourceTable = await describe(source.raw);
if (!sourceTable || !hasExpectedSchema(sourceTable)) {
  throw new Error(`Source table in ${sourceRegion} is missing or incompatible`);
}
const sourceItems = await scanAll(source.document);
if (!sourceItems.length) throw new Error("Source table contains no data");

let targetTable = await describe(target.raw);
if (targetTable && !hasExpectedSchema(targetTable)) {
  const existingItems = await scanAll(target.document);
  if (existingItems.length || !replaceEmptyTarget) {
    throw new Error(
      `Target table is incompatible${
        existingItems.length ? ` and contains ${existingItems.length} items` : ""
      }. Pass --replace-empty-target only for a verified empty table.`,
    );
  }
  await target.raw.send(new DeleteTableCommand({ TableName: tableName }));
  await waitUntilTableNotExists(
    { client: target.raw, maxWaitTime: 300 },
    { TableName: tableName },
  );
  targetTable = null;
}

if (!targetTable) await createTargetTable();
await writeAll(sourceItems);

const targetItems = await scanAll(target.document);
const sourceChecksum = checksum(sourceItems);
const targetChecksum = checksum(targetItems);
if (
  sourceItems.length !== targetItems.length ||
  sourceChecksum !== targetChecksum
) {
  throw new Error(
    `Migration verification failed: ${sourceItems.length}/${targetItems.length} items`,
  );
}

console.log(
  JSON.stringify(
    {
      table: tableName,
      sourceRegion,
      targetRegion,
      migratedItems: targetItems.length,
      checksum: targetChecksum,
      sourceTablePreserved: true,
    },
    null,
    2,
  ),
);
