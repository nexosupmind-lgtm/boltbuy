import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const window = {};
vm.runInNewContext(
  readFileSync(
    new URL("../SITE/Boltclass/answer-sheet.js", import.meta.url),
    "utf8",
  ),
  { window },
);
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/standard-answer-grid.json", import.meta.url),
    "utf8",
  ),
);
const centers = [134, 211, 289, 367, 445],
  heights = [40, 91, 145, 202, 257, 312, 369, 426, 481, 544];
function image(marks = [], kind = "fill") {
  const gray = inflateSync(Buffer.from(fixture.gray_zlib, "base64")),
    data = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i];
    data[i * 4 + 3] = 255;
  }
  marks.forEach((answers, row) => {
    for (const answer of answers) {
      const cx = centers["ABCDE".indexOf(answer)],
        cy = heights[row];
      for (let y = -11; y <= 11; y++)
        for (let x = -11; x <= 11; x++)
          if (
            kind === "fill"
              ? x * x + y * y < 121
              : Math.abs(x - y) < 2 || Math.abs(x + y) < 2
          ) {
            const p = ((cy + y) * fixture.width + cx + x) * 4;
            data[p] = 20;
            data[p + 1] = 30;
            data[p + 2] = 80;
          }
    }
  });
  return { width: fixture.width, height: fixture.height, data };
}
function rotate(source, degrees) {
  const width = source.width + 80,
    height = source.height + 80,
    data = new Uint8ClampedArray(width * height * 4).fill(255),
    a = (degrees * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2,
        dy = y - height / 2,
        sx = Math.round(dx * c + dy * s + source.width / 2),
        sy = Math.round(-dx * s + dy * c + source.height / 2);
      if (sx < 0 || sx >= source.width || sy < 0 || sy >= source.height)
        continue;
      const p = (y * width + x) * 4,
        q = (sy * source.width + sx) * 4;
      data.set(source.data.subarray(q, q + 4), p);
    }
  return { width, height, data };
}
test("The actual supplied A–E image is entirely blank; printed letters and gray stripes are not answers", () => {
  const result = window.BOLT_ANSWER_SHEET.readGrid(image(), 10);
  assert.equal(result.questions.length, 10);
  assert.ok(
    result.questions.every((q) => q.state === "blank" && q.answer === "-"),
  );
});
test("Filled circles and crosses over the printed alternatives identify the chosen letter", () => {
  for (const kind of ["fill", "cross"]) {
    const result = window.BOLT_ANSWER_SHEET.readGrid(
      image(["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"], kind),
      10,
    );
    assert.deepEqual(
      Array.from(result.questions, (q) => q.answer),
      ["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"],
      kind,
    );
  }
});
test("Blank and double marks are held for review instead of selecting a random letter", () => {
  const result = window.BOLT_ANSWER_SHEET.readGrid(
    image(["AB", "", "C", "D", "E", "A", "B", "C", "D", "E"]),
    10,
  );
  assert.equal(result.questions[0].state, "multiple");
  assert.equal(result.questions[0].answer, "-");
  assert.equal(result.questions[1].state, "blank");
  assert.deepEqual(Array.from(result.uncertain), [1, 2]);
});
test("Repeated X marks on the same letter are detected without relying on other blank examples", () => {
  for (const letter of "ABCDE") {
    const result = window.BOLT_ANSWER_SHEET.readGrid(
      image(Array(10).fill(letter), "cross"),
      10,
    );
    assert.ok(
      result.questions.every((q) => q.answer === letter),
      letter,
    );
  }
});
test("Mildly rotated photos retain the order of questions and alternatives", () => {
  for (const degrees of [-5, 5]) {
    const result = window.BOLT_ANSWER_SHEET.readGrid(
      rotate(
        image(["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"]),
        degrees,
      ),
      10,
    );
    assert.deepEqual(
      Array.from(result.questions, (q) => q.answer),
      ["A", "B", "C", "D", "E", "A", "B", "C", "D", "E"],
    );
  }
});
test("A mismatch with the official question count cannot silently shift grades", () => {
  assert.throws(
    () => window.BOLT_ANSWER_SHEET.readGrid(image(), 9),
    /prova tem 9/,
  );
});
