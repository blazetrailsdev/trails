import {
  htmlSafe,
  kernelArray as Array,
  stringifyKeys,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import { fetch, rbObjAsString, rbObjRespondTo, rtest, slice } from "@blazetrails/ruby-compat";

export interface CollectionTemplateObject {
  label(
    objectName: unknown,
    method: unknown,
    contentOrOptions?: unknown,
    options?: Record<string, unknown> | null,
    block?: () => unknown,
  ): SafeBuffer;
  checkbox(
    objectName: unknown,
    method: unknown,
    options?: Record<string, unknown>,
    checkedValue?: unknown,
    uncheckedValue?: unknown,
  ): SafeBuffer;
  radioButton(
    objectName: unknown,
    method: unknown,
    tagValue: unknown,
    options?: Record<string, unknown>,
  ): SafeBuffer;
  capture(block: (builder: Builder) => unknown, builder: Builder): SafeBuffer;
  hiddenFieldTag(name: unknown, value?: unknown, options?: Record<string, unknown>): SafeBuffer;
}

export class Builder {
  object: unknown;
  text: unknown;
  value: unknown;
  protected _templateObject: CollectionTemplateObject;
  protected _objectName: unknown;
  protected _methodName: unknown;
  protected _sanitizedAttributeName: string;
  protected _inputHtmlOptions: Record<string, unknown>;

  constructor(
    templateObject: CollectionTemplateObject,
    objectName: unknown,
    methodName: unknown,
    object: unknown,
    sanitizedAttributeName: string,
    text: unknown,
    value: unknown,
    inputHtmlOptions: Record<string, unknown>,
  ) {
    this._templateObject = templateObject;
    this._objectName = objectName;
    this._methodName = methodName;
    this.object = object;
    this._sanitizedAttributeName = sanitizedAttributeName;
    this.text = text;
    this.value = value;
    this._inputHtmlOptions = inputHtmlOptions;
  }

  label(labelHtmlOptions: Record<string, unknown> = {}, block?: () => unknown): SafeBuffer {
    const htmlOptions = {
      ...slice(this._inputHtmlOptions, "index", "namespace"),
      ...labelHtmlOptions,
    };
    if (this._inputHtmlOptions["id"] != null && this._inputHtmlOptions["id"] !== false) {
      htmlOptions["for"] ??= this._inputHtmlOptions["id"];
    }

    return this._templateObject.label(
      this._objectName,
      this._sanitizedAttributeName,
      this.text,
      htmlOptions,
      block,
    );
  }
}

interface CollectionHelpersHost {
  object: unknown;
  _templateObject: CollectionTemplateObject;
  _objectName: string;
  _methodName: string;
  _options: Record<string, unknown>;
  _collection: Iterable<unknown>;
  _valueMethod: unknown;
  _textMethod: unknown;
  _htmlOptions: Record<string, unknown>;
  sanitizedMethodName(): string;
  sanitizedValue(value: unknown): string;
  tagName(multiple?: unknown, index?: unknown): string;
  valueForCollection(item: unknown, value: unknown): unknown;
  optionHtmlAttributes(element: unknown): Record<string, unknown>;
  renderComponent(builder: Builder): SafeBuffer;
  instantiateBuilder(
    builderClass: typeof Builder,
    item: unknown,
    value: unknown,
    text: unknown,
    htmlOptions: Record<string, unknown>,
  ): Builder;
  defaultHtmlOptionsForCollection(item: unknown, value: unknown): Record<string, unknown>;
  sanitizeAttributeName(value: unknown): string;
  renderCollection(
    block: (
      item: unknown,
      value: unknown,
      text: unknown,
      defaultHtmlOptions: Record<string, unknown>,
    ) => unknown,
  ): SafeBuffer;
  hiddenField(): SafeBuffer;
  hiddenFieldName(): string;
}

export const CollectionHelpers = {
  /** @internal */
  instantiateBuilder(
    this: CollectionHelpersHost,
    builderClass: typeof Builder,
    item: unknown,
    value: unknown,
    text: unknown,
    htmlOptions: Record<string, unknown>,
  ): Builder {
    return new builderClass(
      this._templateObject,
      this._objectName,
      this._methodName,
      item,
      this.sanitizeAttributeName(value),
      text,
      value,
      htmlOptions,
    );
  },

  /** @internal */
  defaultHtmlOptionsForCollection(
    this: CollectionHelpersHost,
    item: unknown,
    value: unknown,
  ): Record<string, unknown> {
    const htmlOptions = { ...this._htmlOptions };

    for (const option of ["checked", "selected", "disabled", "readonly"]) {
      const currentValue = this._options[option];
      if (currentValue == null) continue;

      const accept = rbObjRespondTo(currentValue, "call")
        ? (currentValue as (item: unknown) => unknown)(item)
        : Array(currentValue)
            .map((v) => rbObjAsString(v))
            .includes(rbObjAsString(value));

      if (rtest(accept)) {
        htmlOptions[option] = true;
      } else if (option === "checked") {
        htmlOptions[option] = false;
      }
    }

    htmlOptions["object"] = this.object;
    return htmlOptions;
  },

  /** @internal */
  sanitizeAttributeName(this: CollectionHelpersHost, value: unknown): string {
    return `${this.sanitizedMethodName()}_${this.sanitizedValue(value)}`;
  },

  /**
   * @internal
   * @missingRailsArgs join — PERMANENT
   */
  renderCollection(
    this: CollectionHelpersHost,
    block: (
      item: unknown,
      value: unknown,
      text: unknown,
      defaultHtmlOptions: Record<string, unknown>,
    ) => unknown,
  ): SafeBuffer {
    return htmlSafe(
      globalThis.Array.from(this._collection, (item) => {
        const value = this.valueForCollection(item, this._valueMethod);
        const text = this.valueForCollection(item, this._textMethod);
        const defaultHtmlOptions = this.defaultHtmlOptionsForCollection(item, value);
        const additionalHtmlOptions = this.optionHtmlAttributes(item);

        return block(item, value, text, { ...defaultHtmlOptions, ...additionalHtmlOptions });
      }).join(""),
    );
  },

  /** @internal */
  renderCollectionFor(
    this: CollectionHelpersHost,
    builderClass: typeof Builder,
    block?: (builder: Builder) => unknown,
  ): SafeBuffer {
    const options = stringifyKeys(this._options);
    const renderedCollection = this.renderCollection((item, value, text, defaultHtmlOptions) => {
      const builder = this.instantiateBuilder(builderClass, item, value, text, defaultHtmlOptions);

      if (block) {
        return this._templateObject.capture(block, builder);
      } else {
        return this.renderComponent(builder);
      }
    });

    if (rtest(fetch<unknown>(options, "includeHidden", true))) {
      return this.hiddenField().plus(renderedCollection);
    } else {
      return renderedCollection;
    }
  },

  /** @internal */
  hiddenField(this: CollectionHelpersHost): SafeBuffer {
    const hiddenName = rtest(this._htmlOptions["name"])
      ? this._htmlOptions["name"]
      : this.hiddenFieldName();
    const options = { id: null, form: this._htmlOptions["form"] };
    return this._templateObject.hiddenFieldTag(hiddenName, "", options);
  },

  /** @internal */
  hiddenFieldName(this: CollectionHelpersHost): string {
    return `${this.tagName(false, this._options["index"])}`;
  },
};
