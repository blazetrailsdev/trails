import { type SafeBuffer } from "@blazetrails/activesupport";
import { block as rbBlock, fetch, include, rbModConstSet } from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { SelectRenderer } from "./select-renderer.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include SelectRenderer, FormOptionsHelper` (tags/grouped_collection_select.rb:6-7); the class/interface merge is how the mixins surface on the type side.
export class GroupedCollectionSelect extends Base {
  private _collection: unknown;
  private _groupMethod: unknown;
  private _groupLabelMethod: unknown;
  private _optionKeyMethod: unknown;
  private _optionValueMethod: unknown;
  private _htmlOptions: Record<string, unknown>;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    collection: unknown,
    groupMethod: unknown,
    groupLabelMethod: unknown,
    optionKeyMethod: unknown,
    optionValueMethod: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ) {
    super(objectName, methodName, templateObject, options);
    this._collection = collection;
    this._groupMethod = groupMethod;
    this._groupLabelMethod = groupLabelMethod;
    this._optionKeyMethod = optionKeyMethod;
    this._optionValueMethod = optionValueMethod;
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
      this.optionGroupsFromCollectionForSelect(
        this._collection,
        this._groupMethod,
        this._groupLabelMethod,
        this._optionKeyMethod,
        this._optionValueMethod,
        optionTagsOptions,
      ),
      this._options,
      this._htmlOptions,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface GroupedCollectionSelect {
  /** @internal */
  selectContentTag(
    optionTags: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): unknown;
  optionGroupsFromCollectionForSelect(
    collection: unknown,
    groupMethod: unknown,
    groupLabelMethod: unknown,
    optionKeyMethod: unknown,
    optionValueMethod: unknown,
    selectedKey?: unknown,
  ): SafeBuffer | string;
}

include(GroupedCollectionSelect, SelectRenderer);
include(GroupedCollectionSelect, FormOptionsHelper);

rbModConstSet(Tags, "GroupedCollectionSelect", GroupedCollectionSelect);
