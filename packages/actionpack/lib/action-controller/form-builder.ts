import { ActionController } from "../namespaces.js";
import { Concern, classAttribute, extend } from "@blazetrails/activesupport";

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
Concern.included.call(FormBuilder, null, function (this: object) {
  classAttribute.call(this, "_defaultFormBuilder", { instanceAccessor: false });
});

ActionController.FormBuilder = FormBuilder;
