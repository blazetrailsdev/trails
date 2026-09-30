import {
  SafeBuffer,
  humanize,
  isPlainObject,
  isPresent,
  stringifyKeys,
} from "@blazetrails/activesupport";
import { dup, hashDelete, mergeBang } from "@blazetrails/ruby-compat";

import { labelTag } from "../form-tag-helper.js";
import { Base } from "./base.js";
import { Translator } from "./translator.js";

export class LabelBuilder {
  readonly object: unknown;
  private _templateObject: unknown;
  private _objectName: string;
  private _methodName: string;
  private _tagValue: unknown;

  constructor(
    templateObject: unknown,
    objectName: string,
    methodName: string,
    object: unknown,
    tagValue: unknown,
  ) {
    this._templateObject = templateObject;
    this._objectName = objectName;
    this._methodName = methodName;
    this.object = object;
    this._tagValue = tagValue;
  }

  translation(): unknown {
    const methodAndValue = isPresent(this._tagValue)
      ? `${this._methodName}.${this._tagValue}`
      : this._methodName;

    let content: unknown;
    content ??= new Translator(this.object, this._objectName, methodAndValue, {
      scope: "helpers.label",
    }).translate();
    content ??= humanize(this._methodName);

    return content;
  }

  toString(): string {
    return String(this.translation());
  }
}

export class Label extends Base {
  static LabelBuilder = LabelBuilder;

  private _content: unknown;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    contentOrOptions: unknown = null,
    options: Record<string, unknown> | null = null,
  ) {
    options ??= {};

    let content: unknown;
    const contentIsOptions = isPlainObject(contentOrOptions);
    if (contentIsOptions) {
      mergeBang(options, contentOrOptions as Record<string, unknown>);
      content = null;
    } else {
      content = contentOrOptions;
    }

    super(objectName, methodName, templateObject, options);
    this._content = content;
  }

  override render(block?: (builder: LabelBuilder) => unknown): unknown {
    const options = stringifyKeys(this._options);
    const tagValue = hashDelete(options, "value");
    const nameAndId = dup(options);

    if (nameAndId["for"] != null && nameAndId["for"] !== false) {
      nameAndId["id"] = nameAndId["for"];
    } else {
      hashDelete(nameAndId, "id");
    }

    this.addDefaultNameAndIdForValue(tagValue, nameAndId);
    hashDelete(options, "index");
    hashDelete(options, "namespace");
    if (!Object.hasOwn(options, "for")) options["for"] = nameAndId["id"];

    const builder = new LabelBuilder(
      this._templateObject,
      this._objectName,
      this._methodName,
      this.object,
      tagValue,
    );

    let content: unknown;
    if (block !== undefined) {
      content = this._templateObject.capture(block, builder);
    } else if (isPresent(this._content)) {
      content = this._content instanceof SafeBuffer ? this._content : String(this._content);
    } else {
      content = this.renderComponent(builder);
    }

    return labelTag.call(this, nameAndId["id"], content, options);
  }

  private renderComponent(builder: LabelBuilder): unknown {
    return builder.translation();
  }
}
