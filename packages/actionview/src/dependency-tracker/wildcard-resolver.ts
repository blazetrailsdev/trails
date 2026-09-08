import type { PathSet } from "../path-set.js";
import type { TemplatePath } from "../template-path.js";

/** @internal */
export class WildcardResolver {
  private viewPaths: PathSet | null;
  private wildcardDependencies: string[];
  private explicitDependencies: string[];

  constructor(viewPaths: PathSet | null, dependencies: ReadonlyArray<string>) {
    this.viewPaths = viewPaths;

    this.wildcardDependencies = dependencies.filter((dependency) => dependency.endsWith("/*"));
    this.explicitDependencies = dependencies.filter((dependency) => !dependency.endsWith("/*"));
  }

  resolve(): string[] {
    if (!this.viewPaths || this.wildcardDependencies.length === 0) {
      return [...new Set(this.explicitDependencies)];
    }

    return [...new Set([...this.explicitDependencies, ...this.resolvedWildcardDependencies()])];
  }

  private resolvedWildcardDependencies(): string[] {
    const prefixes = this.wildcardDependencies.map((query) => query.slice(0, -2));

    const paths: TemplatePath[] = [];
    for (const resolver of this.viewPaths as PathSet) {
      paths.push(...(resolver.allTemplatePaths?.() ?? []));
    }

    const uniqPaths = new Map<string, TemplatePath>();
    for (const path of paths) {
      if (!uniqPaths.has(path.virtual)) uniqPaths.set(path.virtual, path);
    }

    return [...uniqPaths.values()]
      .filter((path) => prefixes.includes(path.prefix))
      .map((path) => path.toString())
      .sort();
  }
}
