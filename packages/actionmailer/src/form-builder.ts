import { Concern, classAttribute, extend } from "@blazetrails/activesupport";
import { ActionMailer } from "./namespaces.js";

interface FormBuilderClassHost {
  _defaultFormBuilder: unknown;
}

export function defaultFormBuilder(this: FormBuilderClassHost, builder: unknown): void {
  this._defaultFormBuilder = builder;
}

export const ClassMethods = { defaultFormBuilder };

export const FormBuilder = {
  ClassMethods,

  defaultFormBuilder(this: { constructor: unknown }): unknown {
    return (this.constructor as FormBuilderClassHost)._defaultFormBuilder;
  },
};
extend(FormBuilder, Concern);
(FormBuilder as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function () {
    classAttribute.call(this, "_defaultFormBuilder", { instanceAccessor: false });
  },
);

ActionMailer.FormBuilder = FormBuilder;
