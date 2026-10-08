import { test } from "node:test";
import assert from "node:assert/strict";
import { lockMouse } from "./mouse";

test("reports raw only after the promise-based lock is acquired", async () => {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as unknown,
  });
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
  });
  const element = {
    requestPointerLock: async () => {
      doc.pointerLockElement = element;
      doc.dispatchEvent(new Event("pointerlockchange"));
    },
  };
  assert.equal(await lockMouse(element as unknown as HTMLElement), true);
});
test("falls back to OS movement when raw input is rejected", async () => {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as unknown,
  });
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
  });
  let requests = 0;
  const element = {
    requestPointerLock: async (options?: { unadjustedMovement: boolean }) => {
      requests++;
      if (options?.unadjustedMovement) throw new Error("NotSupportedError");
      doc.pointerLockElement = element;
      queueMicrotask(() => doc.dispatchEvent(new Event("pointerlockchange")));
    },
  };
  assert.equal(await lockMouse(element as unknown as HTMLElement), false);
  assert.equal(requests, 2);
});
test("legacy void APIs wait for capture and do not claim raw input", async () => {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as unknown,
  });
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
  });
  const element = {
    requestPointerLock: () => {
      queueMicrotask(() => {
        doc.pointerLockElement = element;
        doc.dispatchEvent(new Event("pointerlockchange"));
      });
    },
  };
  assert.equal(await lockMouse(element as unknown as HTMLElement), false);
});
