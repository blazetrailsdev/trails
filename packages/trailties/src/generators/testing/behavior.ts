import {
  Dir,
  File,
  RuntimeError,
  env,
  extend,
  include,
  included,
  type FileUtils,
} from "@blazetrails/ruby-compat";
import { Stream, capture, classAttribute } from "@blazetrails/activesupport";
import type { GeneratorBase, GeneratorConfig } from "../base.js";
import { GeneratedAttribute } from "../generated-attribute.js";

type GeneratorClassHost = {
  start(givenArgs?: string[], config?: GeneratorConfig): Promise<unknown>;
  new (args?: unknown[], localOptions?: unknown, config?: GeneratorConfig): GeneratorBase;
};

export interface BehaviorHost {
  destinationRoot: string;
  currentPath?: string;
  defaultArguments?: string[];
  generatorClass?: GeneratorClassHost;
  /** @internal */
  _generator?: GeneratorBase;
}

export const ClassMethods = {
  tests(this: { generatorClass?: unknown }, klass: unknown): void {
    this.generatorClass = klass;
  },

  arguments(this: { defaultArguments?: string[] }, array: string[]): void {
    this.defaultArguments = array;
  },

  destination(this: { destinationRoot?: string }, path: string): void {
    this.destinationRoot = path;
  },
};

export async function runGenerator(
  this: BehaviorHost,
  args: string[] = this.defaultArguments!,
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
  args: unknown[] = this.defaultArguments!,
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
export function isDestinationRootIsSet(this: BehaviorHost): void {
  if (this.destinationRoot == null) {
    throw new RuntimeError(
      "You need to configure your Rails::Generators::TestCase destination root.",
    );
  }
}

/** @internal */
export function ensureCurrentPath(this: BehaviorHost & Pick<FileUtils, "cd">): void {
  this.cd(this.currentPath!);
}

export function prepareDestination(this: BehaviorHost & Pick<FileUtils, "rmRf" | "mkdirP">): void {
  this.rmRf(this.destinationRoot);
  this.mkdirP(this.destinationRoot);
}

/** @internal */
export function migrationFileName(this: BehaviorHost, relative: string): string | null {
  const absolute = File.expandPath(relative, this.destinationRoot);
  const [dirname, fileName] = [
    File.dirname(absolute),
    File.basename(absolute).replace(/\.ts$/, ""),
  ];
  return (
    Dir.glob(`${dirname}/[0-9]*_*.ts`).filter((f) =>
      new RegExp(`\\d+_${fileName}.ts$`).test(f),
    )[0] ?? null
  );
}

export const Behavior = {
  [included](klass: object): void {
    classAttribute.call(klass, "currentPath", { default: File.expandPath(Dir.pwd()) });
    classAttribute.call(klass, "defaultArguments", { default: [] });
    classAttribute.call(klass, "destinationRoot");
    classAttribute.call(klass, "generatorClass");
    extend(klass as never, ClassMethods);
  },
  runGenerator,
  generator,
  createGeneratedAttribute,
  isDestinationRootIsSet,
  ensureCurrentPath,
  prepareDestination,
  migrationFileName,
};

include(Behavior, Stream);
