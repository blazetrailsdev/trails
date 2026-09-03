export type DotTransition = readonly [from: number, sym: string | null, to: number];

export interface DotHost {
  transitions(): readonly DotTransition[];
  acceptingStates(): readonly number[];
}

/** @internal */
export function toDot(this: DotHost): string {
  const edges = this.transitions()
    .map(([from, sym, to]) => `  ${from} -> ${to} [label="${sym ?? "ε"}"];`)
    .join("\n");

  return `digraph nfa {
  rankdir=LR;
  node [shape = doublecircle];
  ${this.acceptingStates().join(" ")};
  node [shape = circle];
${edges}
}
`;
}
