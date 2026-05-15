/**
 * AbstractController::Callbacks
 *
 * Callback type definitions and options for AbstractController action lifecycle.
 * @see https://api.rubyonrails.org/classes/AbstractController/Callbacks.html
 */

import type { AbstractController } from "./base.js";

export type ActionCallback = (
  controller: AbstractController,
) => void | Promise<void> | boolean | Promise<boolean>;

export type AroundCallback = (
  controller: AbstractController,
  next: () => Promise<void>,
) => void | Promise<void>;

export interface CallbackOptions {
  only?: string[];
  except?: string[];
  if?: (controller: AbstractController) => boolean;
  unless?: (controller: AbstractController) => boolean;
  prepend?: boolean;
}

export interface CallbackEntry {
  callback: ActionCallback | AroundCallback;
  type: "before" | "after" | "around";
  options: CallbackOptions;
}
