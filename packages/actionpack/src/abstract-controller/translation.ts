import {
  I18n,
  HtmlSafeTranslation,
  Module,
  htmlEscape,
  dasherize,
  kernelArray,
  underscore,
} from "@blazetrails/activesupport";
import { flatten, rtest } from "@blazetrails/ruby-compat";

export interface TranslationHost {
  actionName: string;
  constructor: { controllerPath(): string };
}

export interface TranslateOptions {
  default?: unknown;
  [key: string]: unknown;
}

/**
 * @inventedArm underscore — PERMANENT
 * @inventedArm dasherize — PERMANENT
 */
export function translate(
  this: TranslationHost,
  key: string,
  options: TranslateOptions = {},
): unknown {
  options = { ...options };
  if (key?.startsWith(".")) {
    const path = this.constructor.controllerPath().replace(/\//g, ".");
    const defaults: unknown[] = [`:${path}${key}`];
    if (rtest(options.default)) defaults.push(options.default);
    options.default = flatten(defaults);
    key = `${path}.${dasherize(underscore(String(this.actionName)))}${key}`;
  }

  if (rtest(options.default) && HtmlSafeTranslation.isHtmlSafeTranslationKey(key)) {
    options.default = kernelArray(options.default).map((value) =>
      typeof value === "string" && !value.startsWith(":") ? htmlEscape(value) : value,
    );
  }

  return HtmlSafeTranslation.translate(key, options);
}

export const t = translate;

export interface LocalizeOptions {
  [key: string]: unknown;
}

export function localize(
  this: TranslationHost,
  object: unknown,
  options: LocalizeOptions = {},
): string {
  return I18n.localize(object, options as Parameters<typeof I18n.localize>[1]) as string;
}

export const l = localize;

export const Translation = new Module((mod) => {
  mod.defineMethod("translate", translate);
  mod.aliasMethod("t", "translate");
  mod.defineMethod("localize", localize);
  mod.aliasMethod("l", "localize");
});
