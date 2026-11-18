import { camelize, remove, underscore } from "@blazetrails/activesupport";
import type { Pathname } from "@blazetrails/ruby-compat";
import { Stimulus } from "./stimulus-trails.js";

export const Manifest = {
  async generateFrom(controllersPath: Pathname): Promise<string[]> {
    const manifest = (await this.extractControllersFrom(controllersPath)).map((controllerPath) =>
      this.importAndRegisterController(controllersPath, controllerPath),
    );

    return [...new Set(manifest)];
  },

  importAndRegisterController(
    controllersPath: Pathname,
    controllerPath: Pathname | string,
  ): string {
    controllerPath = (controllerPath as Pathname).relativePathFrom(controllersPath).toString();
    const modulePath = controllerPath.split(".")[0];
    const controllerClassName = camelize(underscore(modulePath)).replace(/::/g, "__");
    const tagName = remove(modulePath, /_controller/)
      .replace(/_/g, "-")
      .replace(/\//g, "--");

    return `
import ${controllerClassName} from "./${modulePath}"
application.register("${tagName}", ${controllerClassName})
`;
  },

  async extractControllersFrom(directory: Pathname): Promise<Pathname[]> {
    const children = await directory.children();
    const directories: Pathname[][] = [];
    for (const d of children) {
      if (await d.isDirectory()) directories.push(await this.extractControllersFrom(d));
    }
    return [...children.filter((e) => /_controller(\.\w+)+$/m.test(e.toString())), ...directories]
      .flat()
      .sort((a, b) => (a.toString() < b.toString() ? -1 : a.toString() > b.toString() ? 1 : 0));
  },
};

Stimulus.Manifest = Manifest;
