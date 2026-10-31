import { MacroReflection, type Base } from "@blazetrails/activerecord";
import { classAttribute, Concern, extend } from "@blazetrails/activesupport";
import { rbCallSuper } from "@blazetrails/ruby-compat";
import { NamedVariant } from "./named-variant.js";

export class HasAttachedReflection extends MacroReflection {
  private _namedVariants?: { [k: string]: NamedVariant };

  variant(name: string, transformations: { [k: string]: unknown }): NamedVariant {
    return (this.namedVariants[name] = new NamedVariant(transformations));
  }

  get namedVariants(): { [k: string]: NamedVariant } {
    return (this._namedVariants ??= {});
  }
}

export class HasOneAttachedReflection extends HasAttachedReflection {
  get macro(): string {
    return "hasOneAttached";
  }
}

export class HasManyAttachedReflection extends HasAttachedReflection {
  get macro(): string {
    return "hasManyAttached";
  }
}

interface AttachmentHost {
  attachmentReflections: { [k: string]: HasAttachedReflection };
}

function addAttachmentReflection(
  model: typeof Base,
  name: string,
  reflection: HasAttachedReflection,
): void {
  const host = model as unknown as AttachmentHost;
  host.attachmentReflections = { ...host.attachmentReflections, [name]: reflection };
}

/** @internal */
function reflectionClassFor(this: object, macro: string): unknown {
  switch (macro) {
    case "hasOneAttached":
      return HasOneAttachedReflection;
    case "hasManyAttached":
      return HasManyAttachedReflection;
    default:
      return rbCallSuper(this, reflectionClassFor, macro);
  }
}

export const ReflectionExtension = { addAttachmentReflection, reflectionClassFor };

export const ClassMethods = {
  reflectOnAllAttachments(this: AttachmentHost): HasAttachedReflection[] {
    return Object.values(this.attachmentReflections);
  },

  reflectOnAttachment(this: AttachmentHost, attachment: string): HasAttachedReflection | null {
    const reflections = this.attachmentReflections;
    return Object.hasOwn(reflections, attachment) ? reflections[attachment] : null;
  },
};

export const ActiveRecordExtensions = { ClassMethods };
extend(ActiveRecordExtensions, Concern);
Concern.included.call(ActiveRecordExtensions as never, null, function (this: typeof Base) {
  classAttribute.call(this, "attachmentReflections", { instanceWriter: false, default: {} });
});
