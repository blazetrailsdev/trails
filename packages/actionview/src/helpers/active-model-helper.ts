import { isPresent } from "@blazetrails/activesupport";
import { defineModule, rbCallSuper, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { ActionView } from "../namespaces.js";

export const ActiveModelHelper = defineModule({});

export interface ActiveModelInstanceTag {
  object: unknown;
  contentTag(type: string, options: unknown, ...args: unknown[]): unknown;
  tag(type: string, options: Record<string, unknown>, ...args: unknown[]): unknown;
  errorWrapping(htmlTag: unknown): unknown;
  errorMessage(): unknown;
}

type Host = ActiveModelInstanceTag & {
  _activeModelObject?: unknown;
  _methodName: string;
  _templateObject: unknown;
  isObjectHasErrors(): boolean;
  isSelectMarkupHelper(type: string): boolean;
  isTagGenerateErrors(options: Record<string, unknown>): boolean;
};

function object(this: Host): unknown {
  if (this._activeModelObject == null || this._activeModelObject === false) {
    const superObject = rbCallSuper(this, object);
    this._activeModelObject = rbObjRespondTo(superObject, "toModel")
      ? (superObject as { toModel(): unknown }).toModel()
      : superObject;
  }
  return this._activeModelObject;
}

function contentTag(this: Host, type: string, options: unknown, ...args: unknown[]): unknown {
  const _super = () => rbCallSuper(this, contentTag, type, options, ...args);
  return this.isSelectMarkupHelper(type) ? _super() : this.errorWrapping(_super());
}

function tag(
  this: Host,
  type: string,
  options: Record<string, unknown>,
  ...args: unknown[]
): unknown {
  const _super = () => rbCallSuper(this, tag, type, options, ...args);
  return this.isTagGenerateErrors(options) ? this.errorWrapping(_super()) : _super();
}

function errorWrapping(this: Host, htmlTag: unknown): unknown {
  if (this.isObjectHasErrors()) {
    return ActionView.Base.fieldErrorProc.call(
      this._templateObject as InstanceType<typeof ActionView.Base>,
      htmlTag,
      this,
    );
  } else {
    return htmlTag;
  }
}

function errorMessage(this: Host): unknown {
  return (this.object as { errors: { get(attribute: string): unknown } }).errors.get(
    this._methodName,
  );
}

/** @internal */
function isObjectHasErrors(this: Host): boolean {
  return (
    rbObjRespondTo(this.object, "errors") &&
    rbObjRespondTo((this.object as { errors: unknown }).errors, "get") &&
    isPresent(this.errorMessage())
  );
}

/** @internal */
function isSelectMarkupHelper(this: Host, type: string): boolean {
  return ["optgroup", "option"].includes(type);
}

/** @internal */
function isTagGenerateErrors(this: Host, options: Record<string, unknown>): boolean {
  return options["type"] !== "hidden";
}

export const ActiveModelInstanceTag = defineModule(
  {
    contentTag,
    tag,
    errorWrapping,
    errorMessage,
  },
  {},
  { isObjectHasErrors, isSelectMarkupHelper, isTagGenerateErrors },
);
Object.defineProperty(ActiveModelInstanceTag, "object", {
  get: object,
  enumerable: true,
  configurable: true,
});
