import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClipFilterGraph,
  buildFfmpegInputArgs,
  validateClipForRender,
} from "../workers/clip-renderer/render-plan.mjs";

function makeClip(overrides = {}) {
  return {
    _id: "clip-123",
    userId: "user-123",
    renderVersion: 1,
    transition: "fade",
    mediaItems: [
      { key: "media/user-123/one.mp4", type: "video" },
      { key: "media/user-123/two.jpg", type: "image" },
    ],
    timeline: [
      { mediaIndex: 0, duration: 3, trimStart: 1.25, filter: "warm" },
      { mediaIndex: 1, duration: 2, trimStart: 0, filter: "mono" },
    ],
    textLayers: [
      {
        id: "title",
        text: "A safe title",
        start: 2.5,
        end: 4,
        x: 50,
        y: 72,
        size: 32,
        color: "#ffffff",
        background: true,
        backgroundColor: "#000000",
      },
    ],
    ...overrides,
  };
}

test("validates media ownership, timeline length, and aggregate duration", () => {
  const plan = validateClipForRender(makeClip(), "user-123");
  assert.equal(plan.duration, 5);
  assert.equal(plan.timeline.length, 2);
  assert.equal(plan.textLayers.length, 1);
  assert.equal(plan.renderVersion, 1);
});

test("rejects source media outside the owner's S3 prefix", () => {
  const clip = makeClip({
    mediaItems: [
      { key: "media/another-user/stolen.mp4", type: "video" },
      { key: "media/user-123/two.jpg", type: "image" },
    ],
  });
  assert.throws(() => validateClipForRender(clip, "user-123"), /owner's upload folder/);
});

test("rejects invalid clip duration and mismatched timelines", () => {
  assert.throws(() => validateClipForRender(makeClip({
    timeline: [{ mediaIndex: 0, duration: 121, trimStart: 0 }],
  }), "user-123"), /invalid scene duration/);
  assert.throws(() => validateClipForRender(makeClip({
    timeline: [{ mediaIndex: 0, duration: 3, trimStart: 0 }],
  }), "user-123"), /incomplete/);
});

test("builds cut render graph with scene filters, timed text, and silence for images", () => {
  const plan = validateClipForRender(makeClip({ transition: "cut" }), "user-123");
  const graph = buildClipFilterGraph({
    plan,
    textFilePaths: ["/tmp/overlay-0.txt"],
    hasAudio: [true, false],
  });
  assert.match(graph.filterComplex, /xfade=/);
  assert.match(graph.filterComplex, /concat=n=2:v=1:a=0/);
  assert.match(graph.filterComplex, /acrossfade/ === true ? /acrossfade/ : /anullsrc/);
  assert.match(graph.filterComplex, /anullsrc/);
  assert.match(graph.filterComplex, /drawtext/);
  assert.match(graph.filterComplex, /between\(t,/);
  assert.equal(graph.outputDuration, 5);
});

test("uses the selected transition and calculates overlap duration", () => {
  const plan = validateClipForRender(makeClip({ transition: "slide" }), "user-123");
  const graph = buildClipFilterGraph({ plan, hasAudio: [false, false] });
  assert.match(graph.filterComplex, /transition=slideleft/);
  assert.match(graph.filterComplex, /acrossfade/);
  assert.equal(graph.outputDuration, 4.65);
});

test("constructs FFmpeg input arguments without shell interpolation", () => {
  const plan = validateClipForRender(makeClip(), "user-123");
  const args = buildFfmpegInputArgs(plan, ["/tmp/source one.mp4", "/tmp/photo;touch nope.jpg"]);
  assert.deepEqual(args.slice(0, 8), [
    "-ss", "1.25", "-t", "3", "-i", "/tmp/source one.mp4", "-loop", "1",
  ]);
  assert.ok(args.includes("/tmp/photo;touch nope.jpg"));
});
