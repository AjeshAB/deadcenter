import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCode, encodeCode } from "./code";
test("preserves unknown and error keys with ADS/sniper sections", () => {
  const code = "0;P;c;5;0l;4;0f;1;0m;1;A;c;7;S;c;2";
  const parsed = parseCode(code);
  parsed["0l"] = "6";
  assert.equal(encodeCode(parsed, code), "0;P;c;5;0l;6;0f;1;0m;1;A;c;7;S;c;2");
});
test("rejects invalid or incomplete primary codes", () => {
  for (const code of ["", "0;A;c;5", "0;P;c", "invalid"])
    assert.throws(() => parseCode(code));
});
