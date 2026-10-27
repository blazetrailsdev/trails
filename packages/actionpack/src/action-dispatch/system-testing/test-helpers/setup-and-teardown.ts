import { rbCallSuper } from "@blazetrails/ruby-compat";
import { takeFailedScreenshot, type ScreenshotHelperHost } from "./screenshot-helper.js";

export interface SetupAndTeardownHost extends ScreenshotHelperHost {
  _context?: { close(): Promise<void> };
}

/** @internal */
export async function beforeTeardown(this: SetupAndTeardownHost): Promise<void> {
  try {
    await takeFailedScreenshot.call(this);
  } finally {
    await rbCallSuper(this, beforeTeardown);
  }
}

/** @internal */
export async function afterTeardown(this: SetupAndTeardownHost): Promise<void> {
  try {
    await this._context?.close();
  } finally {
    this._context = undefined;
    this._page = undefined;
    await rbCallSuper(this, afterTeardown);
  }
}

export const SetupAndTeardown = { beforeTeardown, afterTeardown };
