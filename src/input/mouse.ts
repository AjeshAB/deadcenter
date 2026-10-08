/** Resolve only once capture is actually active, including legacy void APIs. */
function requestLock(
  element: HTMLElement,
  unadjusted: boolean,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let hasPromise = false;
    const cleanup = () => {
      clearTimeout(timeout);
      document.removeEventListener("pointerlockchange", changed);
      document.removeEventListener("pointerlockerror", failed);
    };
    const changed = () => {
      queueMicrotask(() => {
        if (document.pointerLockElement === element) {
          cleanup();
          resolve(unadjusted && hasPromise);
        }
      });
    };
    const failed = () => {
      cleanup();
      reject(
        new Error(
          "Mouse capture is unavailable. Open this page in standalone Chrome or Edge and click Start again.",
        ),
      );
    };
    const timeout = setTimeout(failed, 3000);
    document.addEventListener("pointerlockchange", changed);
    document.addEventListener("pointerlockerror", failed);
    try {
      const result = (
        element.requestPointerLock as (options?: {
          unadjustedMovement: boolean;
        }) => Promise<void> | void
      ).call(element, unadjusted ? { unadjustedMovement: true } : undefined);
      hasPromise = Boolean(result && typeof result.then === "function");
      if (result) result.then(changed, failed);
    } catch {
      failed();
    }
  });
}
export async function lockMouse(element: HTMLElement): Promise<boolean> {
  try {
    return await requestLock(element, true);
  } catch {
    return requestLock(element, false);
  }
}
