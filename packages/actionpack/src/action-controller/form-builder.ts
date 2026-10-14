import { Concern, Module, classAttribute, extend } from "@blazetrails/activesupport";

interface FormBuilderClassHost {
  _defaultFormBuilder: unknown;
}

export function defaultFormBuilder(this: FormBuilderClassHost, builder: unknown): void {
  this._defaultFormBuilder = builder;
}

export const ClassMethods = { defaultFormBuilder };

export const FormBuilder = new Module((mod) => {
  extend(mod, Concern);

  (mod as unknown as { included(base: null, block: (this: object) => void): void }).included(
    null,
    function () {
      classAttribute.call(this, "_defaultFormBuilder", { instanceAccessor: false });
    },
  );

  mod.defineMethod("defaultFormBuilder", function (this: { constructor: unknown }): unknown {
    return (this.constructor as FormBuilderClassHost)._defaultFormBuilder;
  });
}) as Module & { ClassMethods: typeof ClassMethods };
FormBuilder.ClassMethods = ClassMethods;
