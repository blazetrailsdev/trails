/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include` (topic.rb:4-6); the class/interface merge is how `include()` surfaces those members on the type side. */
import { NumberHelper, include } from "@blazetrails/activesupport";
import { Model } from "../../index.js";
import {
  AttributeMethods,
  ClassMethods as AttributeMethodsClassMethods,
} from "../../attribute-methods.js";
import { Callbacks as ValidationsCallbacks } from "../../validations/callbacks.js";

export class Topic extends Model {
  declare static attributeMethodSuffix: OmitThisParameter<
    (typeof AttributeMethodsClassMethods)["attributeMethodSuffix"]
  >;
  declare static defineAttributeMethod: OmitThisParameter<
    (typeof AttributeMethodsClassMethods)["defineAttributeMethod"]
  >;
  declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];

  static {
    include(this, ValidationsCallbacks);
    include(this, AttributeMethods);

    this.attributeMethodSuffix("BeforeTypeCast", { parameters: false });
    this.defineAttributeMethod("price");

    this.afterValidation(":performAfterValidation");
  }

  static _validatesDefaultKeys(): string[] {
    return [...new Set([...super._validatesDefaultKeys(), "message"])];
  }

  declare private _title: string | null | undefined;
  declare private _authorName: string | null | undefined;
  declare private _content: string | null | undefined;
  declare private _approved: unknown | undefined;
  declare private _createdAt: unknown | undefined;
  declare private _afterValidationPerformed: boolean | undefined;
  declare private _price: unknown | undefined;

  get title(): string | null {
    return this._title ?? null;
  }

  set title(value: string | null) {
    this._title = value;
  }

  get authorName(): string | null {
    return this._authorName ?? null;
  }

  set authorName(value: string | null) {
    this._authorName = value;
  }

  get content(): string | null {
    return this._content ?? null;
  }

  set content(value: string | null) {
    this._content = value;
  }

  get approved(): unknown {
    return this._approved ?? null;
  }

  set approved(value: unknown) {
    this._approved = value;
  }

  get createdAt(): unknown {
    return this._createdAt ?? null;
  }

  set createdAt(value: unknown) {
    this._createdAt = value;
  }

  get afterValidationPerformed(): boolean {
    return this._afterValidationPerformed ?? false;
  }

  set afterValidationPerformed(value: boolean) {
    this._afterValidationPerformed = value;
  }

  set price(value: unknown) {
    this._price = value;
  }

  conditionIsTrue(): boolean {
    return true;
  }

  conditionIsFalse(): boolean {
    return false;
  }

  performAfterValidation(): void {
    this.afterValidationPerformed = true;
  }

  myValidation(): void {
    if (this.title == null) this.errors.add("title", "is missing");
  }

  myValidationWithArg(attr: string): void {
    if ((this as unknown as Record<string, unknown>)[attr] == null)
      this.errors.add(attr, "is missing");
  }

  get price(): unknown {
    return NumberHelper.numberToCurrency(this._price);
  }

  get rawPrice(): unknown {
    return this._price ?? null;
  }

  attributeBeforeTypeCast(attr: string): unknown {
    return (this as unknown as Record<string, unknown>)[`_${attr}`];
  }

  private five(): number {
    return 5;
  }
}
export interface Topic extends AttributeMethods {}
