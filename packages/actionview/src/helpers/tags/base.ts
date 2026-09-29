import {
  ArgumentError,
  block,
  NotImplementedError,
  fetch,
  hashDelete,
  rbFPublicSend,
  rbInspect,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";

import type { FormTagHelperHost } from "../form-tag-helper.js";

export class Base {
  object: unknown;
  protected _objectName: string;
  protected _methodName: string;
  protected _templateObject: FormTagHelperHost;
  protected _skipDefaultIds: unknown;
  protected _allowMethodNamesOutsideObject: unknown;
  protected _options: Record<string, unknown>;
  protected _generateIndexedNames: boolean;
  protected _autoIndex: unknown;
  private _sanitizedMethodName?: string;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    options: Record<string, unknown> = {},
  ) {
    this._objectName = objectName == null ? "" : String(objectName);
    this._methodName = String(methodName);
    this._templateObject = templateObject as FormTagHelperHost;

    let lastMatch = /\[\]$/.exec(this._objectName);
    if (lastMatch) {
      this._objectName = this._objectName.replace(/\[\]$/, "");
    } else {
      lastMatch = /\[\]\]$/.exec(this._objectName);
      if (lastMatch) this._objectName = this._objectName.replace(/\[\]\]$/, "]");
    }
    this.object = this.retrieveObject(hashDelete(options, "object"));
    this._skipDefaultIds = hashDelete(options, "skipDefaultIds");
    this._allowMethodNamesOutsideObject = hashDelete(options, "allowMethodNamesOutsideObject");
    this._options = options;

    if (lastMatch) {
      this._generateIndexedNames = true;
      this._autoIndex = this.retrieveAutoindex(lastMatch.input.slice(0, lastMatch.index));
    } else {
      this._generateIndexedNames = false;
      this._autoIndex = null;
    }
  }

  render(): unknown {
    // @nie disposition=TODO
    throw new NotImplementedError("Subclasses must implement a render method");
  }

  protected value(): unknown {
    if (this.object == null || this.object === false) return null;

    if (
      this._allowMethodNamesOutsideObject != null &&
      this._allowMethodNamesOutsideObject !== false
    ) {
      return rbObjRespondTo(this.object, this._methodName)
        ? rbFPublicSend(this.object, this._methodName)
        : null;
    } else {
      return rbFPublicSend(this.object, this._methodName);
    }
  }

  protected valueBeforeTypeCast(): unknown {
    if (this.object == null || this.object === false) return null;

    const methodBeforeTypeCast = this._methodName + "BeforeTypeCast";

    const cameFromUser = this.isValueCameFromUser();
    if (
      cameFromUser != null &&
      cameFromUser !== false &&
      rbObjRespondTo(this.object, methodBeforeTypeCast)
    ) {
      return rbFPublicSend(this.object, methodBeforeTypeCast);
    } else {
      return this.value();
    }
  }

  protected isValueCameFromUser(): unknown {
    const methodName = `${this._methodName}CameFromUser`;
    return !rbObjRespondTo(this.object, methodName) || rbFPublicSend(this.object, methodName);
  }

  protected retrieveObject(object: unknown): unknown {
    if (object != null && object !== false) {
      return object;
    } else if (Object.hasOwn(this._templateObject, this._objectName)) {
      return (this._templateObject as unknown as Record<string, unknown>)[this._objectName];
    }
    return null;
  }

  protected retrieveAutoindex(preMatch: string): unknown {
    const object =
      this.object != null && this.object !== false
        ? this.object
        : (this._templateObject as unknown as Record<string, unknown>)[preMatch];
    if (object != null && object !== false && rbObjRespondTo(object, "toParam")) {
      return (object as { toParam(): unknown }).toParam();
    } else {
      throw new ArgumentError(
        `object[] naming but object param and @object var don't exist or don't respond to to_param: ${rbInspect(object)}`,
      );
    }
  }

  protected addDefaultNameAndId(options: Record<string, unknown>): void {
    const index = this.nameAndIdIndex(options);
    options["name"] = fetch(
      options,
      "name",
      block(() => this.tagName(options["multiple"], index)),
    );

    if (this.isGenerateIds()) {
      options["id"] = fetch(
        options,
        "id",
        block(() => this.tagId(index, hashDelete(options, "namespace"))),
      );
      const namespace = hashDelete(options, "namespace");
      if (namespace != null && namespace !== false) {
        options["id"] =
          options["id"] != null && options["id"] !== false
            ? `${namespace}_${options["id"]}`
            : namespace;
      }
    }
  }

  protected tagName(multiple: unknown = false, index: unknown = null): string {
    return this._templateObject.fieldName(this._objectName, this.sanitizedMethodName(), {
      multiple: multiple,
      index: index,
    });
  }

  protected tagId(index: unknown = null, namespace: unknown = null): string {
    return this._templateObject.fieldId(this._objectName, this._methodName, {
      index: index,
      namespace: namespace,
    });
  }

  protected sanitizedMethodName(): string {
    return (this._sanitizedMethodName ??= this._methodName.endsWith("?")
      ? this._methodName.slice(0, -1)
      : this._methodName);
  }

  protected nameAndIdIndex(options: Record<string, unknown>): unknown {
    if (Object.hasOwn(options, "index")) {
      const index = hashDelete(options, "index");
      return index != null && index !== false ? index : "";
    } else if (this._generateIndexedNames) {
      return this._autoIndex != null && this._autoIndex !== false ? this._autoIndex : "";
    }
    return null;
  }

  protected isGenerateIds(): boolean {
    return !(this._skipDefaultIds != null && this._skipDefaultIds !== false);
  }
}
