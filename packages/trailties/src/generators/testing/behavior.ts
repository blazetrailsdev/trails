import { Dir, File, env } from "@blazetrails/ruby-compat";
import { capture } from "@blazetrails/activesupport";
import type { GeneratorBase, GeneratorConfig } from "../base.js";
import { GeneratedAttribute } from "../generated-attribute.js";

type GeneratorClassHost = {
  start(givenArgs?: string[], config?: GeneratorConfig): Promise<unknown>;
  new (args?: unknown[], localOptions?: unknown, config?: GeneratorConfig): GeneratorBase;
};

export interface BehaviorHost {
  destinationRoot: string;
  defaultArguments?: string[];
  generatorClass?: GeneratorClassHost;
  /** @internal */
  _generator?: GeneratorBase;
}

export async function runGenerator(
  this: BehaviorHost,
  args: string[] = this.defaultArguments ?? [],
  config: GeneratorConfig = {},
): Promise<unknown> {
  if (!(args.includes("--no-skip-bundle") || args.includes("--dev")))
    args = [...args, "--skip-bundle"];
  if (!(args.includes("--no-skip-bootsnap") || args.includes("--skip-bootsnap")))
    args = [...args, "--skip-bootsnap"];

  if (env["RAILS_LOG_TO_STDOUT"] === "true") {
    return this.generatorClass!.start(args, { destinationRoot: this.destinationRoot, ...config });
  } else {
    return capture("stdout", () =>
      this.generatorClass!.start(args, { destinationRoot: this.destinationRoot, ...config }),
    );
  }
}

export function generator(
  this: BehaviorHost,
  args: unknown[] = this.defaultArguments ?? [],
  options: unknown = {},
  config: GeneratorConfig = {},
): GeneratorBase {
  return (this._generator ??= new this.generatorClass!(args, options, {
    destinationRoot: this.destinationRoot,
    ...config,
  }));
}

export function createGeneratedAttribute(
  attributeType: string,
  name: string = "test",
  index: string | null = null,
): GeneratedAttribute {
  return GeneratedAttribute.parse([name, attributeType, index].filter((x) => x != null).join(":"));
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
