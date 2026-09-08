import { Digest } from "@blazetrails/activesupport/digest";

import { _Base } from "./base-slot.js";
import { DependencyTracker } from "./dependency-tracker.js";
import type { LookupContext } from "./lookup-context.js";
import type { Template } from "./template.js";
import { TemplatePath } from "./template-path.js";

export interface DigestorOptions {
  name: string;
  format?: string | null;
  finder: LookupContext;
  dependencies?: string[] | null;
}

interface Logger {
  error(message: string): void;
}

export class Digestor {
  static digest({ name, format = null, finder, dependencies = null }: DigestorOptions): string {
    let cacheKey: string;
    if (dependencies == null || dependencies.length === 0) {
      cacheKey = `${name}.${format ?? ""}`;
    } else {
      const dependenciesSuffix = dependencies
        .flat()
        .filter((dependency) => dependency != null)
        .join(".");
      cacheKey = `${name}.${format ?? ""}.${dependenciesSuffix}`;
    }

    const digestCache = finder.digestCache();
    const cached = digestCache.get(cacheKey);
    if (cached != null) return cached;

    const path = TemplatePath.parse(name);
    const root = this.tree(path.toString(), finder, path.isPartial());
    if (dependencies) {
      for (const injectedDep of dependencies) {
        root.children.push(new Injected(injectedDep, null, null));
      }
    }
    const digest = root.digest(finder);
    digestCache.set(cacheKey, digest);
    return digest;
  }

  static logger(): Logger {
    return (_Base?.logger as Logger | null) ?? NullLogger;
  }

  static tree(
    name: string,
    finder: LookupContext,
    partial = false,
    seen: Record<string, Node> = {},
  ): Node {
    const logicalName = name.replace(/\/_/g, "/");
    const interpolated = name.includes("#");

    const path = TemplatePath.parse(name);

    let template: Template | null;
    if (
      !interpolated &&
      (template = this.findTemplate(finder, path.name, [path.prefix], partial, []))
    ) {
      const node = seen[template.identifier];
      if (node) {
        return node;
      } else {
        const created = (seen[template.identifier] = Node.create(
          name,
          logicalName,
          template,
          partial,
        ));

        const deps = DependencyTracker.findDependencies(name, template, finder.viewPaths);
        const uniqueDeps: Record<string, string> = {};
        for (const n of deps) {
          uniqueDeps[n.replace(/\/_/g, "/")] ??= n;
        }
        for (const depFile of Object.values(uniqueDeps)) {
          created.children.push(this.tree(depFile, finder, true, seen));
        }
        return created;
      }
    } else {
      if (!interpolated) {
        this.logger().error(`  Couldn't find template for digesting: ${name}`);
      }

      return (seen[name] ??= new Missing(name, logicalName, null));
    }
  }

  /** @internal */
  private static findTemplate(
    finder: LookupContext,
    name: string,
    prefixes: ReadonlyArray<string>,
    partial: boolean,
    keys: ReadonlyArray<string>,
  ): Template | null {
    return finder.disableCache(
      () => (finder.findAll(name, prefixes, partial, keys)[0] as Template) ?? null,
    );
  }
}

export class Node {
  readonly name: string;
  readonly logicalName: string | null;
  readonly template: Template | null;
  readonly children: Node[];

  static create(
    name: string,
    logicalName: string | null,
    template: Template | null,
    partial: boolean,
  ): Node {
    const klass = partial ? Partial : Node;
    return new klass(name, logicalName, template, []);
  }

  constructor(
    name: string,
    logicalName: string | null,
    template: Template | null,
    children: Node[] = [],
  ) {
    this.name = name;
    this.logicalName = logicalName;
    this.template = template;
    this.children = children;
  }

  digest(finder: LookupContext, stack: Node[] = []): string {
    return Digest.hexdigest(
      `${this.template?.source ?? ""}-${this.dependencyDigest(finder, stack)}`,
    );
  }

  dependencyDigest(finder: LookupContext, stack: Node[]): string {
    return this.children
      .map((node) => {
        if (stack.includes(node)) {
          return false;
        } else {
          let digest = finder.digestCache().get(node.name);
          if (digest == null) {
            stack.push(node);
            digest = node.digest(finder, stack);
            stack.pop();
            finder.digestCache().set(node.name, digest);
          }
          return digest;
        }
      })
      .join("-");
  }

  toDepMap(seen: Set<Node> = new Set()): unknown {
    if (!seen.has(this)) {
      seen.add(this);
      return this.children.length > 0
        ? { [this.name]: this.children.map((c) => c.toDepMap(seen)) }
        : this.name;
    } else {
      return this.name;
    }
  }
}

export class Partial extends Node {}

export class Missing extends Node {
  override digest(_finder: LookupContext, _: Node[] = []): string {
    return "";
  }
}

export class Injected extends Node {
  override digest(_finder: LookupContext, _: Node[] = []): string {
    return this.name;
  }
}

export class NullLogger {
  static debug(_: string): void {}
  static error(_: string): void {}
}
