import { type SafeBuffer } from "@blazetrails/activesupport";
import { include, rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { Builder, CollectionHelpers } from "./collection-helpers.js";

export class CheckBoxBuilder extends Builder {
  checkbox(extraHtmlOptions: Record<string, unknown> = {}): SafeBuffer {
    const htmlOptions = { ...extraHtmlOptions, ...this._inputHtmlOptions };
    htmlOptions["multiple"] = true;
    htmlOptions["skipDefaultIds"] = false;
    return this._templateObject.checkbox(
      this._objectName,
      this._methodName,
      htmlOptions,
      this.value,
      null,
    );
  }

  checkBox(extraHtmlOptions: Record<string, unknown> = {}): SafeBuffer {
    return this.checkbox(extraHtmlOptions);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include CollectionHelpers, FormOptionsHelper` (tags/collection_check_boxes.rb:8-9); the class/interface merge is how the mixins surface on the type side.
export class CollectionCheckBoxes extends Base {
  static CheckBoxBuilder = CheckBoxBuilder;

  private _collection: unknown;
  private _valueMethod: unknown;
  private _textMethod: unknown;
  private _htmlOptions: Record<string, unknown>;

  /** @inlinedFrom ActionView::Helpers::Tags::CollectionHelpers#initialize rails/v8.0.2/actionview/lib/action_view/helpers/tags/collection_helpers.rb:30-37 */
  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    collection: unknown,
    valueMethod: unknown,
    textMethod: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ) {
    super(objectName, methodName, templateObject, options);
    this._collection = collection;
    this._valueMethod = valueMethod;
    this._textMethod = textMethod;
    this._htmlOptions = htmlOptions;
  }

  override render(block?: (builder: Builder) => unknown): SafeBuffer {
    return this.renderCollectionFor(CheckBoxBuilder, block);
  }

  /** @internal */
  private renderComponent(builder: CheckBoxBuilder): SafeBuffer {
    return builder.checkbox().plus(builder.label());
  }

  /** @internal */
  private hiddenFieldName(): string {
    return `${CollectionHelpers.hiddenFieldName.call(this as never)}[]`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface CollectionCheckBoxes {
  /** @internal */
  renderCollectionFor(
    builderClass: typeof Builder,
    block?: (builder: Builder) => unknown,
  ): SafeBuffer;
}

include(CollectionCheckBoxes, CollectionHelpers);
include(CollectionCheckBoxes, FormOptionsHelper);

rbModConstSet(Tags, "CollectionCheckBoxes", CollectionCheckBoxes);
