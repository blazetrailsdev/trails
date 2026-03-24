// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

import { humanize } from "@rails-ts/activesupport";
import { I18n } from "./i18n.js";
import type { ErrorDetail } from "./errors.js";

export class NestedError {
  readonly base: unknown;
  readonly innerError: ErrorDetail;
  readonly attribute: string;

  constructor(base: unknown, innerError: ErrorDetail, options?: { attribute?: string }) {
    this.base = base;
    this.innerError = innerError;
    this.attribute = options?.attribute ?? innerError.attribute;
  }

  get message(): string {
    return this.innerError.message;
  }

  get fullMessage(): string {
    if (this.attribute === "base") return this.message;
    const modelClass = (this.base as AnyRecord)?.constructor;
    const humanAttr = modelClass?.humanAttributeName
      ? modelClass.humanAttributeName(this.attribute)
      : humanize(this.attribute);
    const format = I18n.t("activemodel.errors.format", {
      defaultValue: "%{attribute} %{message}",
    });
    return format.replace("%{attribute}", humanAttr).replace("%{message}", this.message);
  }

  get type(): string {
    return this.innerError.type;
  }
}
