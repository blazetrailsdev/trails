import { type SafeBuffer } from "@blazetrails/activesupport";
import { include, rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { Builder, CollectionHelpers } from "./collection-helpers.js";

export class RadioButtonBuilder extends Builder {
  radioButton(extraHtmlOptions: Record<string, unknown> = {}): SafeBuffer {
    const htmlOptions = { ...extraHtmlOptions, ...this._inputHtmlOptions };
    htmlOptions["skipDefaultIds"] = false;
    return this._templateObject.radioButton(
      this._objectName,
      this._methodName,
      this.value,
      htmlOptions,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include CollectionHelpers, FormOptionsHelper` (tags/collection_radio_buttons.rb:8-9); the class/interface merge is how the mixins surface on the type side.
export class CollectionRadioButtons extends Base {
  static RadioButtonBuilder = RadioButtonBuilder;

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
    return this.renderCollectionFor(RadioButtonBuilder, block);
  }

  /** @internal */
  private renderComponent(builder: RadioButtonBuilder): SafeBuffer {
    return builder.radioButton().plus(builder.label());
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface CollectionRadioButtons {
  /** @internal */
  renderCollectionFor(
    builderClass: typeof Builder,
    block?: (builder: Builder) => unknown,
  ): SafeBuffer;
}

include(CollectionRadioButtons, CollectionHelpers);
include(CollectionRadioButtons, FormOptionsHelper);

rbModConstSet(Tags, "CollectionRadioButtons", CollectionRadioButtons);
