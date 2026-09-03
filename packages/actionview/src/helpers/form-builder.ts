/** @internal */

export interface FormBuilderOptions {
  index?: string | number;
  multipart?: boolean;
  builder?: typeof FormBuilder;
  [k: string]: unknown;
}

export class FormBuilder {
  readonly objectName: string;
  readonly object: unknown;
  readonly template: unknown;
  readonly options: FormBuilderOptions;

  constructor(
    objectName: string,
    object: unknown,
    template: unknown,
    options: FormBuilderOptions = {},
  ) {
    this.objectName = objectName;
    this.object = object;
    this.template = template;
    this.options = options;
  }
}
