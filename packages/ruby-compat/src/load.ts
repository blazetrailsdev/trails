import { getPath } from "./fs-adapter.js";
import { registerConstant } from "./variable.js";

let loads = 0;

/**
 * `rb_f_load` (`vendor/ruby/v3.3.11/load.c:903`), `Kernel#load`: evaluates
 * the file every time it is called, unlike `require`. ESM keeps one module
 * record per URL, so each load imports the file under a URL no earlier load
 * used. A Ruby file binds its top-level constants in `rb_cObject`
 * (`rb_const_set`, `vendor/ruby/v3.3.11/variable.c:3674`); an ES module
 * exports them, and each constant-named export is seated there.
 *
 * @noRailsEquivalent PERMANENT
 */
export async function rbFLoad(fname: string): Promise<true> {
  const path = getPath().pathToFileURL!(fname);
  path.search = `?${(loads += 1)}`;
  const exports = (await import(path.href)) as Record<string, unknown>;
  for (const [id, val] of Object.entries(exports)) {
    if (/^[\p{Lu}\p{Lt}]/u.test(id)) registerConstant(id, val);
  }
  return true;
}
