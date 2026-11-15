/** H4: a red stamp, a blue seal and a dark signature are detected as candidates. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { detectMarks } from "../../src/lib/document-intelligence/marks.ts";

test("H4: image rules find a red stamp, a blue seal and a dark lower mark", async () => {
  const canvas = createCanvas(400, 400);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = "#d02020";
  ctx.fillRect(50, 50, 60, 40);
  ctx.fillStyle = "#2040d0";
  ctx.fillRect(250, 80, 50, 50);
  ctx.fillStyle = "#101010";
  ctx.fillRect(100, 340, 120, 20);
  const png = canvas.toBuffer("image/png");
  const marks = await detectMarks(png, 400, 1);
  assert.ok(marks.some((m) => m.kind === "stamp"));
  assert.ok(marks.some((m) => m.kind === "seal"));
  assert.ok(marks.some((m) => m.kind === "signature"));
  assert.ok(marks.every((m) => m.confidence > 0 && m.confidence <= 0.9));
});
