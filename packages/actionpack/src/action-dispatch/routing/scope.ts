/**
 * Linked list of scope frames built up by the Mapper DSL, mirroring
 * `ActionDispatch::Routing::Mapper::Scope`.
 *
 * @internal
 */

export type ScopeLevel =
  | "resource"
  | "resources"
  | "collection"
  | "member"
  | "new"
  | "nested"
  | "root"
  | null;

export type ScopeFrameHash = Record<string, unknown>;

const RESOURCE_SCOPES: ReadonlySet<ScopeLevel> = new Set<ScopeLevel>(["resource", "resources"]);
const RESOURCE_METHOD_SCOPES: ReadonlySet<ScopeLevel> = new Set<ScopeLevel>([
  "collection",
  "member",
  "new",
]);

/** @internal */
export const SCOPE_OPTIONS = [
  "path",
  "shallowPath",
  "as",
  "shallowPrefix",
  "module",
  "controller",
  "action",
  "pathNames",
  "constraints",
  "shallow",
  "blocks",
  "defaults",
  "via",
  "format",
  "options",
  "to",
] as const;

export class Scope {
  readonly parent: Scope | null;
  readonly scopeLevel: ScopeLevel;
  private readonly hash: ScopeFrameHash | null;

  constructor(
    hash: ScopeFrameHash | null,
    parent: Scope | null = Scope.ROOT,
    scopeLevel: ScopeLevel = null,
  ) {
    this.parent = parent;
    this.scopeLevel = scopeLevel;
    // Rails: @hash = parent ? parent.frame.merge(hash) : hash
    // Preserve `null` when parent is null so `null?` (isNull) is observable
    // on Scope.ROOT. Children of ROOT spread over `ROOT.frame` (which is
    // `null`); JS object-spread treats `null` as empty, so the result is
    // a plain copy of `hash` — matching Rails where ROOT.frame is `{}`.
    this.hash = parent ? { ...parent.frame, ...(hash ?? {}) } : hash;
  }

  isNested(): boolean {
    return this.scopeLevel === "nested";
  }
  isNull(): boolean {
    return this.hash == null && this.parent == null;
  }
  isRoot(): boolean {
    return this.parent === Scope.ROOT;
  }
  isResources(): boolean {
    return this.scopeLevel === "resources";
  }
  isResourceMethodScope(): boolean {
    return RESOURCE_METHOD_SCOPES.has(this.scopeLevel);
  }
  isResourceScope(): boolean {
    return RESOURCE_SCOPES.has(this.scopeLevel);
  }

  /** Mirrors Rails `Scope#action_name`. */
  actionName(
    namePrefix: string | undefined,
    prefix: string | undefined,
    collectionName: string | undefined,
    memberName: string | undefined,
  ): Array<string | undefined> {
    switch (this.scopeLevel) {
      case "nested":
        return [namePrefix, prefix];
      case "collection":
        return [prefix, namePrefix, collectionName];
      case "new":
        return [prefix, "new", namePrefix, memberName];
      case "member":
        return [prefix, namePrefix, memberName];
      case "root":
        return [namePrefix, collectionName, prefix];
      default:
        return [namePrefix, memberName, prefix];
    }
  }

  options(): readonly string[] {
    return SCOPE_OPTIONS;
  }

  newChild(hash: ScopeFrameHash): Scope {
    return new Scope(hash, this, this.scopeLevel);
  }
  newLevel(level: ScopeLevel): Scope {
    return new Scope(this.frame, this, level);
  }

  get(key: string): unknown {
    return this.hash ? this.hash[key] : undefined;
  }
  get frame(): ScopeFrameHash | null {
    return this.hash;
  }

  *[Symbol.iterator](): IterableIterator<Scope> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Scope = this;
    while (node !== Scope.ROOT) {
      yield node;
      const next = node.parent;
      if (!next) break;
      node = next;
    }
  }

  static readonly ROOT: Scope = Object.freeze(new Scope(null, null, null)) as Scope;
}
