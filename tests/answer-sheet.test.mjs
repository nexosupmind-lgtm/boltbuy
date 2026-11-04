import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { canonicalKey, gradeAnswers } from "../server/answer-key.js";
const window = {};
vm.runInNewContext(
  readFileSync(
    new URL("../SITE/Boltclass/answer-sheet.js", import.meta.url),
    "utf8",
  ),
  { window },
);
function fixture({
  marks = ["A", "C", "E"],
  missing = false,
  upsideDown = false,
  skew = false,
} = {}) {
  const width = 800,
    height = 1100,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  const map = (x, y) =>
    skew ? [x * 0.85 + 60 + y * 0.035, y * 0.88 + 50 + x * 0.025] : [x, y];
  const dot = (x, y, r) => {
    [x, y] = map(x, y);
    for (let yy = Math.floor(y - r); yy <= y + r; yy++)
      for (let xx = Math.floor(x - r); xx <= x + r; xx++)
        if (
          (xx - x) ** 2 + (yy - y) ** 2 <= r * r &&
          xx >= 0 &&
          xx < width &&
          yy >= 0 &&
          yy < height
        ) {
          const i = (yy * width + xx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
  };
  [
    [45, 45],
    [755, 45],
    [755, 1055],
    [45, 1055],
  ]
    .slice(missing ? 1 : 0)
    .forEach(([cx, cy]) => {
      [cx, cy] = map(cx, cy);
      for (let y = Math.round(cy - 11); y <= cy + 11; y++)
        for (let x = Math.round(cx - 11); x <= cx + 11; x++) {
          let i = (y * width + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    });
  if (!upsideDown) dot(90, 45, 7);
  marks.forEach((mark, n) => {
    for (const a of mark) {
      if (a === "-") continue;
      dot(
        n < 20 ? 160 + "ABCDE".indexOf(a) * 48 : 520 + "ABCDE".indexOf(a) * 48,
        250 + (n % 20) * 35,
        8,
      );
    }
  });
  return { width, height, data };
}
test("Bubble reading produces numbered answers with a perspective-aligned sheet", () => {
  for (const skew of [false, true]) {
    const value = window.BOLT_ANSWER_SHEET.read(fixture({ skew }), 3);
    assert.equal(value.text, "01 A\n02 C\n03 E");
    assert.equal(value.uncertain.length, 0);
  }
});
test("Blank and double-marked questions require review and do not become invented answers", () => {
  const value = window.BOLT_ANSWER_SHEET.read(
    fixture({ marks: ["AB", "-", "E"] }),
    3,
  );
  assert.equal(value.text, "01 -\n02 -\n03 E");
  assert.deepEqual(Array.from(value.uncertain), [1, 2]);
});
test("Missing alignment markers and wrong orientation are rejected", () => {
  assert.throws(
    () => window.BOLT_ANSWER_SHEET.read(fixture({ missing: true }), 3),
    /quadrados/,
  );
  assert.throws(
    () => window.BOLT_ANSWER_SHEET.read(fixture({ upsideDown: true }), 3),
    /girada/,
  );
});
test("Printed sheet supports two columns, escapes exam title and enforces the photo limit", () => {
  const text = window.BOLT_ANSWER_SHEET.sheet(40, "<script>");
  assert.match(text, /&lt;script&gt;/);
  assert.match(text, /40 QUESTÕES/);
  assert.match(text, /cx="712"/);
  assert.throws(() => window.BOLT_ANSWER_SHEET.sheet(41), /40/);
  const result = window.BOLT_ANSWER_SHEET.read(
    fixture({ marks: Array(40).fill("D") }),
    40,
  );
  assert.equal(result.text.split("\n")[39], "40 D");
});
test("Canonical grading ignores case and validates numbering, blanks and mismatched questions", () => {
  assert.equal(canonicalKey("2 b\n1 a"), "01 A\n02 B");
  assert.equal(gradeAnswers("01 A\n02 B", "01 A\n02 -").score, 5);
  assert.throws(() => canonicalKey("01 A\n03 B"), /saltos/);
  assert.throws(() => gradeAnswers("01 A", "02 A"), /mesmas questões/);
});
