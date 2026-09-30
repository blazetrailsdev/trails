import { Dir, File, compact } from "@blazetrails/ruby-compat";
import { GeneratedAttribute } from "../generated-attribute.js";

export interface BehaviorHost {
  destinationRoot: string;
}

export function createGeneratedAttribute(
  attributeType: string,
  name: string = "test",
  index: string | null = null,
): GeneratedAttribute {
  return GeneratedAttribute.parse(compact([name, attributeType, index]).join(":"));
}

/** @internal */
export function migrationFileName(this: BehaviorHost, relative: string): string | undefined {
  const absolute = File.expandPath(relative, this.destinationRoot);
  const [dirname, fileName] = [
    File.dirname(absolute),
    File.basename(absolute).replace(/\.ts$/, ""),
  ];
  return Dir.glob(`${dirname}/[0-9]*_*.ts`).filter((f) =>
    new RegExp(`\\d+_${fileName}.ts$`).test(f),
  )[0];
}
