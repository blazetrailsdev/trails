import { type SafeBuffer } from "@blazetrails/activesupport";
import { block as rbBlock, fetch, include, rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { SelectRenderer } from "./select-renderer.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include SelectRenderer, FormOptionsHelper` (tags/collection_select.rb:6-7); the class/interface merge is how the mixins surface on the type side.
export class CollectionSelect extends Base {
  private _collection: unknown;
  private _valueMethod: unknown;
  private _textMethod: unknown;
  private _htmlOptions: Record<string, unknown>;

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

  override render(): unknown {
    const optionTagsOptions = {
      selected: fetch(
        this._options,
        "selected",
        rbBlock(() => this.value()),
      ),
      disabled: this._options["disabled"],
    };

    return this.selectContentTag(
      this.optionsFromCollectionForSelect(
        this._collection,
        this._valueMethod,
        this._textMethod,
        optionTagsOptions,
      ),
      this._options,
      this._htmlOptions,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface CollectionSelect {
  /** @internal */
  selectContentTag(
    optionTags: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): unknown;
  optionsFromCollectionForSelect(
    collection: unknown,
    valueMethod: unknown,
    textMethod: unknown,
    selected?: unknown,
  ): SafeBuffer | string;
}

include(CollectionSelect, SelectRenderer);
include(CollectionSelect, FormOptionsHelper);

rbModConstSet(Tags, "CollectionSelect", CollectionSelect);
