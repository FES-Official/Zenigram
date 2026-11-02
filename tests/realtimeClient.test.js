import test from "node:test";
import assert from "node:assert/strict";
import { isRealtimeEnabled } from "../src/app/lib/realtimeClient.js";

test("realtime stays disabled on production serverless deployments unless enabled", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRealtime = process.env.NEXT_PUBLIC_REALTIME_ENABLED;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_REALTIME_ENABLED;
    assert.equal(isRealtimeEnabled(), false);

    process.env.NEXT_PUBLIC_REALTIME_ENABLED = "true";
    assert.equal(isRealtimeEnabled(), true);

    process.env.NEXT_PUBLIC_REALTIME_ENABLED = "false";
    assert.equal(isRealtimeEnabled(), false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousRealtime === undefined) delete process.env.NEXT_PUBLIC_REALTIME_ENABLED;
    else process.env.NEXT_PUBLIC_REALTIME_ENABLED = previousRealtime;
  }
});

test("realtime is enabled by default during development", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRealtime = process.env.NEXT_PUBLIC_REALTIME_ENABLED;

  try {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_REALTIME_ENABLED = "false";
    assert.equal(isRealtimeEnabled(), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousRealtime === undefined) delete process.env.NEXT_PUBLIC_REALTIME_ENABLED;
    else process.env.NEXT_PUBLIC_REALTIME_ENABLED = previousRealtime;
  }
});
