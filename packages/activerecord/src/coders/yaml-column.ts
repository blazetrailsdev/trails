import { Psych } from "@blazetrails/ruby-compat/psych";
import { registerConstant } from "@blazetrails/ruby-compat";
import { ColumnSerializer } from "./column-serializer.js";
import { useYamlUnsafeLoad, yamlColumnPermittedClasses } from "../active-record.js";

type ClassLike = new (...args: unknown[]) => unknown;

/** @internal */
class SafeCoder {
  private readonly permittedClasses: unknown[];
  private readonly unsafeLoad: boolean | null;

  constructor({
    permittedClasses = [],
    unsafeLoad = null,
  }: { permittedClasses?: unknown[]; unsafeLoad?: boolean | null } = {}) {
    this.permittedClasses = permittedClasses;
    this.unsafeLoad = unsafeLoad;
  }

  dump(object: unknown): string {
    if (this.unsafeLoad == null ? useYamlUnsafeLoad() : this.unsafeLoad) {
      return Psych.dump(object);
    } else {
      return Psych.safeDump(object, {
        permittedClasses: [...this.permittedClasses, ...yamlColumnPermittedClasses()],
        aliases: true,
      });
    }
  }

  load(payload: unknown): unknown {
    if (this.unsafeLoad == null ? useYamlUnsafeLoad() : this.unsafeLoad) {
      return Psych.unsafeLoad(payload as string | Uint8Array);
    } else {
      return Psych.safeLoad(payload as string | Uint8Array, {
        permittedClasses: [...this.permittedClasses, ...yamlColumnPermittedClasses()],
        aliases: true,
      });
    }
  }
}

/** @internal */
export class YAMLColumn extends ColumnSerializer {
  constructor(
    attrName: string,
    objectClass: ClassLike = Object as unknown as ClassLike,
    { permittedClasses = [], unsafeLoad = null }: YamlColumnOptions = {},
  ) {
    super(
      attrName,
      new SafeCoder({ permittedClasses: permittedClasses ?? [], unsafeLoad: unsafeLoad }),
      objectClass,
    );
  }

  override initWith(coder: Record<string, unknown>): void {
    if (coder["coder"] == null || coder["coder"] === false) {
      const permittedClasses = (coder["permitted_classes"] as unknown[] | undefined) ?? [];
      const unsafeLoad = (coder["unsafe_load"] as boolean | undefined) ?? false;
      coder["coder"] = new SafeCoder({
        permittedClasses: permittedClasses,
        unsafeLoad: unsafeLoad,
      });
    }
    super.initWith(coder);
  }
}

export interface YamlColumnOptions {
  permittedClasses?: unknown[];
  unsafeLoad?: boolean | null;
}

registerConstant("ActiveRecord::Coders::YAMLColumn", YAMLColumn);
registerConstant("ActiveRecord::Coders::YAMLColumn::SafeCoder", SafeCoder);
