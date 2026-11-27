import type { NameError } from "@blazetrails/ruby-compat/name-error";
import { toS } from "@blazetrails/ruby-compat/object";
import { constGet, rbModConstants } from "@blazetrails/ruby-compat/variable";
import { SpellChecker } from "../../spell-checker.js";

class ClassName extends String {
  readonly namespace: string;

  constructor(name: string, namespace = "") {
    super(name);
    this.namespace = namespace;
  }

  fullName(): ClassName {
    return new (this.constructor as typeof ClassName)(`${this.namespace}${this}`);
  }
}

export class ClassNameChecker {
  static ClassName = ClassName;

  readonly className: string;
  _receiver: unknown;
  _originalMessage: string;
  _corrections?: string[];
  _scopes?: object[];

  constructor(exception: NameError & { originalMessage(): string }) {
    [this.className, this._receiver, this._originalMessage] = [
      exception.constantName!,
      exception.receiver(),
      exception.originalMessage(),
    ];
  }

  get corrections(): string[] {
    return (this._corrections ??= new SpellChecker({
      dictionary: this.classNames() as unknown as string[],
    })
      .correct(this.className)
      .map((name) => String((name as unknown as ClassName).fullName()))
      .filter((qualifiedName) => !this._originalMessage.includes(qualifiedName)));
  }

  classNames(): ClassName[] {
    return this.scopes().flatMap((scope) =>
      rbModConstants(scope).map((c) => new ClassName(c, scope === Object ? "" : `${toS(scope)}::`)),
    );
  }

  scopes(): object[] {
    return (this._scopes ??= [
      ...new Set(
        toS(this._receiver)
          .split("::")
          .reduce(
            (_scopes, scope) => {
              _scopes.push(constGet(_scopes.at(-1)!, scope) as object);
              return _scopes;
            },
            [Object] as object[],
          ),
      ),
    ]);
  }
}
