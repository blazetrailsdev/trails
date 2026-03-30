/**
 * AttributeMethods mixin contract — dynamic attribute method generation.
 *
 * Mirrors: ActiveModel::AttributeMethods
 *
 * Model implements this via attributeMethodPrefix/Suffix/Affix,
 * defineAttributeMethods, and undefineAttributeMethods.
 */
export interface AttributeMethods {
  hasAttribute(name: string): boolean;
  attributePresent(name: string): boolean;
  attributeMissing(name: string): unknown;
  respondTo(method: string): boolean;
}

/**
 * Represents an error related to a missing attribute.
 *
 * Mirrors: ActiveModel::MissingAttributeError
 */
export class MissingAttributeError extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "MissingAttributeError";
  }
}

/**
 * Represents a pattern for matching attribute method names.
 *
 * Mirrors: ActiveModel::AttributeMethods::ClassMethods::AttributeMethodPattern
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AttrNames {
  const DEF_SAFE_NAME = /^[a-zA-Z_]\w*$/;

  export function defineAttributeAccessorMethod(
    attrName: string,
    writer: boolean = false,
  ): { methodName: string; attrNameRef: string } {
    const methodName = writer ? `${attrName}=` : attrName;
    if (DEF_SAFE_NAME.test(attrName)) {
      return { methodName, attrNameRef: `'${attrName}'` };
    }
    const escaped = attrName
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    return { methodName, attrNameRef: `'${escaped}'` };
  }
}

export class AttributeMethodPattern {
  readonly prefix: string;
  readonly suffix: string;
  readonly method_missing_target: string;

  constructor(prefix: string = "", suffix: string = "") {
    this.prefix = prefix;
    this.suffix = suffix;
    this.method_missing_target = `attribute_${prefix}${suffix ? `${suffix}` : ""}`;
  }

  match(method: string): { attr: string } | null {
    if (this.prefix && !method.startsWith(this.prefix)) return null;
    if (this.suffix && !method.endsWith(this.suffix)) return null;
    const attr = method.slice(this.prefix.length, this.suffix ? -this.suffix.length : undefined);
    return attr ? { attr } : null;
  }

  methodName(attrName: string): string {
    return `${this.prefix}${attrName}${this.suffix}`;
  }
}
