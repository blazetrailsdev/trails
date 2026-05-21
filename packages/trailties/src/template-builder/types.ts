/** @internal */
declare const refBrand: unique symbol;

export type Ref = { readonly [refBrand]: true; readonly name: string; readonly from?: string };
export type Type = {
  readonly [refBrand]: "type";
  readonly text: string;
  readonly refs: readonly Ref[];
};
export type Body = {
  readonly [refBrand]: "body";
  readonly text: string;
  readonly refs: readonly Ref[];
};

export interface Import {
  from: string;
  default?: string;
  /** `"named"` value is shorthand for "alias === original name". */
  named?: Record<string, string | "named">;
  typeOnly?: boolean;
}
export interface ImportResult<TNames extends string = string> {
  import: Import;
  refs: { readonly [K in TNames]: Ref };
}

export type FieldType = Type | Ref | string;
export interface Field {
  name: string;
  type: FieldType;
  nullable?: boolean;
  initializer?: string;
  comment?: string;
}
export interface MethodParam {
  name: string;
  type: FieldType;
}
export interface Method {
  name: string;
  params: MethodParam[];
  returnType?: FieldType;
  body: Body;
  async?: boolean;
  static?: boolean;
  visibility?: "public" | "protected" | "private";
}

export interface ClassOpts {
  name: string;
  extends?: Ref;
  implements?: Ref[];
  exported?: boolean;
  body: Array<Field | Method>;
}
export type ClassDecl = ClassOpts & { readonly __kind: "class" };

export interface InterfaceOpts {
  name: string;
  extends?: Ref[];
  exported?: boolean;
  body: Field[];
}
export type InterfaceDecl = InterfaceOpts & { readonly __kind: "interface" };

export type RawDecl = { readonly __kind: "raw"; text: string };
export type Declaration = ClassDecl | InterfaceDecl | RawDecl;

export interface ModuleSource {
  imports?: Import[];
  declarations: Declaration[];
  preamble?: string;
}
