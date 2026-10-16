import { Module } from "@blazetrails/ruby-compat";
import { takeFailedScreenshot, type ScreenshotHelperHost } from "./screenshot-helper.js";

export interface SetupAndTeardownHost extends ScreenshotHelperHost {
  _context?: { close(): Promise<void> };
}

export const SetupAndTeardown = new Module();

/** @internal */
export async function beforeTeardown(this: SetupAndTeardownHost): Promise<void> {
  try {
    await takeFailedScreenshot.call(this);
  } finally {
    await SetupAndTeardown.superMethod(this, "beforeTeardown")?.();
  }
}

/** @internal */
export async function afterTeardown(this: SetupAndTeardownHost): Promise<void> {
  try {
    await this._context?.close();
  } finally {
    this._context = undefined;
    this._page = undefined;
    await SetupAndTeardown.superMethod(this, "afterTeardown")?.();
  }
}

SetupAndTeardown.defineMethod("beforeTeardown", beforeTeardown);
SetupAndTeardown.defineMethod("afterTeardown", afterTeardown);
