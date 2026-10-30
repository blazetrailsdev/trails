import { MacroReflection, type Base } from "@blazetrails/activerecord";
import { classAttribute } from "@blazetrails/activesupport";
import { included } from "@blazetrails/ruby-compat";

export class HasAttachedReflection extends MacroReflection {}

export class HasOneAttachedReflection extends HasAttachedReflection {
  get macro(): string {
    return "has_one_attached";
  }
}

export class HasManyAttachedReflection extends HasAttachedReflection {
  get macro(): string {
    return "has_many_attached";
  }
}

export function addAttachmentReflection(
  model: typeof Base,
  name: string,
  reflection: HasAttachedReflection,
): void {
  const host = model as unknown as { attachmentReflections: { [k: string]: unknown } };
  host.attachmentReflections = { ...host.attachmentReflections, [name]: reflection };
}

export const ActiveRecordExtensions = {
  [included](klass: typeof Base): void {
    classAttribute.call(klass, "attachmentReflections", { instanceWriter: false, default: {} });
  },
};
