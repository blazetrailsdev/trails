import { loadParity, percent, shortSha } from "../../src/lib/parity.js";

export default {
  async load() {
    const data = await loadParity();
    return {
      measuredAt: shortSha(data.measuredAt),
      packages: data.packages.map((p) => ({
        name: p.name,
        railsCounterpart: p.railsCounterpart ?? "—",
        api: percent(p.api),
        tests: percent(p.tests),
      })),
    };
  },
};
