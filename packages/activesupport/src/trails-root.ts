export type TrailsRootSource = string | null | (() => string | null);

let source: TrailsRootSource = null;

export function trailsRoot(): string | null {
  return typeof source === "function" ? source() : source;
}

export function setTrailsRoot(root: TrailsRootSource): void {
  source = root;
}
