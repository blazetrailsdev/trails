export function restFn(...syms: unknown[]): string {
  return `len=${syms.length} isArr=${String(Array.isArray(syms))} v=${JSON.stringify(syms)}`;
}
export const restAlias = restFn;
