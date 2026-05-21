// Mirrors railties/lib/rails/generators/actions.rb. PR 1.10 ports `generate`.
// Unported (no trails equivalent — Ruby-shape DSL emits Ruby-shape files that
// don't exist in a trails app):
//   gem, gem_group, github, add_source — trails uses package.json
//   route, environment, application      — trails uses src/config/*.ts
// PR 1.10b adds git/after_bundle/rake.

export interface ActionsHost {
  output: (msg: string) => void;
}

export interface GeneratorActionsState {
  pendingGenerators: Array<{ what: string; args: string[] }>;
}

export function generate(
  this: ActionsHost & GeneratorActionsState,
  what: string,
  ...args: string[]
): void {
  this.output(`      generate  ${what}`);
  this.pendingGenerators ??= [];
  this.pendingGenerators.push({ what, args });
}
