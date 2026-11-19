import { loadParity, packagePage } from "../../src/lib/parity.js";

export default {
  async paths() {
    const data = await loadParity();
    return data.packages.map((p) => ({
      params: { pkg: p.name },
      content: packagePage(data, p.name),
    }));
  },
};
