import { isBlank, isPlainObject } from "@blazetrails/activesupport";
import {
  block as rbBlock,
  fetch,
  first,
  include,
  Range,
  rbFSend,
  rbModConstSet,
  rbObjRespondTo,
  rtest,
} from "@blazetrails/ruby-compat";

import { Tags } from "../../namespaces.js";
import { FormOptionsHelper } from "../form-options-helper.js";
import { Base } from "./base.js";
import { SelectRenderer } from "./select-renderer.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include SelectRenderer, FormOptionsHelper` (tags/select.rb:7-8); the class/interface merge is how the mixins surface on the type side.
export class Select extends Base {
  private _choices: unknown;
  private _htmlOptions: Record<string, unknown>;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    choices: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
    block?: () => unknown,
  ) {
    super(objectName, methodName, templateObject, options);
    let selectChoices: unknown = block
      ? (templateObject as { capture(b: () => unknown): unknown }).capture(() => {
          const yielded = block();
          return rtest(yielded) ? yielded : "";
        })
      : choices;
    if (selectChoices instanceof Range) selectChoices = selectChoices.toA();
    this._choices = selectChoices;

    this._htmlOptions = htmlOptions;
  }

  override render(): unknown {
    const optionTagsOptions = {
      selected: fetch(
        this._options,
        "selected",
        rbBlock(() => (this.value() == null ? "" : this.value())),
      ),
      disabled: this._options["disabled"],
    };

    const optionTags = this.isGroupedChoices()
      ? this.groupedOptionsForSelect(this._choices, optionTagsOptions)
      : this.optionsForSelect(this._choices, optionTagsOptions);

    return this.selectContentTag(optionTags, this._options, this._htmlOptions);
  }

  /** @internal */
  private isGroupedChoices(): boolean {
    if (isBlank(this._choices)) return false;
    const head = first(
      isPlainObject(this._choices) ? Object.entries(this._choices) : (this._choices as unknown[]),
    );
    return rbObjRespondTo(head, "second") && Array.isArray(rbFSend(head, "second"));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface Select {
  /** @internal */
  selectContentTag(
    optionTags: unknown,
    options: Record<string, unknown>,
    htmlOptions: Record<string, unknown>,
  ): unknown;
  optionsForSelect(container: unknown, selected?: unknown): unknown;
  groupedOptionsForSelect(groupedOptions: unknown, selectedKey?: unknown): unknown;
}

include(Select, SelectRenderer);
include(Select, FormOptionsHelper);

rbModConstSet(Tags, "Select", Select);
