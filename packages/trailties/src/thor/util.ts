import {
  capitalize,
  File,
  isEmpty,
  NotImplementedError,
  RbConfig,
  rbModConstants,
  rbModName,
  rbModToS,
  rbObjAsString,
  rbObjRespondTo,
  rtest,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { Base, type BaseClass } from "./base.js";

type ThorClass = BaseClass & { isCommandExists(commandName: string): boolean };

let _rubyCommand: string | undefined;

export function findByNamespace(namespace: string): ThorClass | null {
  if (isEmpty(namespace) || /^:/m.test(namespace)) namespace = `default${namespace}`;
  return (
    (Base.subclasses() as ThorClass[]).find((klass) => klass.namespace() === namespace) ?? null
  );
}

export function namespaceFromThorClass(constant: unknown): string {
  let name = (
    typeof constant === "function" ? rbModToS(constant as never) : rbObjAsString(constant)
  ).replace(/^Thor::Sandbox::/gm, "");
  name = snakeCase(name).replace(/:+/g, ":");
  return name;
}

export function thorClassesIn(klass: BaseClass): BaseClass[] {
  const stringfiedConstants = rbModConstants(klass).map((constant) => rbObjAsString(constant));
  return Base.subclasses().filter((subclass) => {
    if (!rtest(rbModName(subclass))) return false;
    return stringfiedConstants.includes(
      rbModName(subclass)!.replaceAll(`${rbModName(klass)}::`, ""),
    );
  });
}

export function snakeCase(str: string): string {
  if (/^[A-Z_]+$/m.test(str)) return str.toLowerCase();
  const lastMatch = str
    .replace(/\B[A-Z]/g, "_$&")
    .replace(/_+/g, "_")
    .match(/_*(.*)/)!;
  return lastMatch.at(-1)!.toLowerCase();
}

/** @missingRailsArgs join — PERMANENT */
export function camelCase(str: string): string {
  if (!/_/.test(str) && /[A-Z]+.*/.test(str)) return str;
  return stringSplit(str, "_")
    .map((s) => capitalize(s, []))
    .join("");
}

export function findClassAndCommandByNamespace(
  namespace: string,
  fallback: unknown = true,
): [ThorClass | null, string | null] {
  let klass: ThorClass | null = null;
  let command: string | null = null;
  if (namespace.includes(":")) {
    const pieces = stringSplit(namespace, ":");
    command = pieces.pop() ?? null;
    namespace = pieces.join(":");
    if (isEmpty(namespace)) namespace = "default";
    klass =
      (Base.subclasses() as ThorClass[]).find(
        (thor) => thor.namespace() === namespace && thor.isCommandExists(command!),
      ) ?? null;
  }
  if (!rtest(klass)) {
    klass = findByNamespace(namespace);
    command = null;
  }
  if (!rtest(klass) && rtest(fallback)) {
    command = namespace;
    klass = findByNamespace("");
  }
  return [klass, command];
}
export const findClassAndTaskByNamespace = findClassAndCommandByNamespace;

export function rubyCommand(): string {
  return (_rubyCommand ||= (() => {
    const rubyName = RbConfig.CONFIG["ruby_install_name"];
    let ruby = File.join(RbConfig.CONFIG["bindir"], rubyName);
    ruby += RbConfig.CONFIG["EXEEXT"];

    if (rubyName !== "ruby" && rbObjRespondTo(File, "readlink")) {
      try {
        let alternateRuby = File.join(RbConfig.CONFIG["bindir"], "ruby");
        alternateRuby += RbConfig.CONFIG["EXEEXT"];

        if (File.isSymlink(alternateRuby)) {
          const linkedRuby = (File as unknown as { readlink(fileName: string): string }).readlink(
            alternateRuby,
          );

          if (linkedRuby === rubyName || linkedRuby === ruby) ruby = alternateRuby;
        }
      } catch (e) {
        if (!(e instanceof NotImplementedError)) throw e;
      }
    }

    ruby = ruby.replace(/[^]*\s[^]*/, '"$&"');
    return ruby;
  })());
}

export function escapeGlobs(path: unknown): string {
  return rbObjAsString(path).replace(/[*?{}[\]]/g, "\\$&");
}
