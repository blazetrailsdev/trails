import { loadParity, percent, shortSha } from "$lib/parity";

export const prerender = true;

export async function load() {
  const data = await loadParity();
  return {
    measuredAt: shortSha(data.measuredAt),
    coverage: Object.fromEntries(data.packages.map((p) => [p.name, percent(p.api)])),
  };
}
