import { classify, dasherize, underscore } from "../../base.js";
import {
  ref,
  tsBody,
  tsClass,
  tsMethod,
  tsModule,
  type Import,
  type Method,
  type Ref,
} from "../../../template-builder/index.js";

export interface ControllerPaths {
  className: string;
  displayName: string;
  controllerFile: string;
  viewBase: string;
  helperName: string;
  helperFile: string;
  namespaceParts: string[];
}

const ACTIONPACK = "@blazetrails/actionpack";

export function controllerPathHelpers(name: string): ControllerPaths {
  const stripped = name.replace(/[_-]?[Cc]ontroller$/, "");
  const parts = stripped.split("/");
  const className =
    parts.length > 1
      ? parts.map((p) => classify(p)).join("") + "Controller"
      : classify(stripped) + "Controller";
  const displayName =
    parts.length > 1
      ? parts.map((p) => classify(p)).join("::") + "Controller"
      : classify(stripped) + "Controller";
  const controllerFile =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/") + "-controller"
      : dasherize(underscore(stripped)) + "-controller";
  const viewBase =
    parts.length > 1
      ? parts.map((p) => dasherize(underscore(p))).join("/")
      : dasherize(underscore(stripped));
  const leaf = parts[parts.length - 1]!;
  const helperName = classify(leaf) + "Helper";
  const helperFile = dasherize(underscore(leaf)) + "-helper";
  return {
    className,
    displayName,
    controllerFile,
    viewBase,
    helperName,
    helperFile,
    namespaceParts: parts,
  };
}

export interface EmitControllerClassOpts {
  className: string;
  parent?: { ref: Ref; import?: Import };
  methods: Method[];
}

export function emitControllerClass(opts: EmitControllerClassOpts): string {
  let extendsRef: Ref;
  const imports: Import[] = [];
  if (opts.parent) {
    extendsRef = opts.parent.ref;
    if (opts.parent.import) imports.push(opts.parent.import);
  } else {
    // ActionController.Base — render as dotted access; cover the namespace
    // import explicitly so auto-collect does not produce a broken import.
    extendsRef = ref("ActionController.Base");
    imports.push({ from: ACTIONPACK, named: { ActionController: "named" } });
  }
  return tsModule({
    imports,
    declarations: [tsClass({ name: opts.className, extends: extendsRef, body: opts.methods })],
  });
}

export function actionMethod(name: string, ts: boolean): Method {
  return tsMethod({
    name,
    params: [],
    async: true,
    returnType: ts ? "Promise<void>" : undefined,
    body: tsBody`// TODO: implement`,
  });
}

export function parentRefForRelative(parent: string, depth: number): { ref: Ref; import: Import } {
  const parentClass = classify(parent.replace(/::/g, "_").replace(/\//g, "_"));
  const parentPath = dasherize(underscore(parent.replace(/::/g, "_").replace(/\//g, "_")));
  const prefix = depth > 0 ? "../".repeat(depth) : "./";
  const from = `${prefix}${parentPath}.js`;
  return {
    ref: ref(parentClass, from),
    import: { from, named: { [parentClass]: "named" } },
  };
}
