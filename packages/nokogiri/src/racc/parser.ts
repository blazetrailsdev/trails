import { kernelCatch, kernelThrow, rbInspect } from "@blazetrails/ruby-compat";

export class ParseError extends Error {
  override name = "Racc::ParseError";
}

type RaccArg = [
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
  (number | null)[],
  number,
  (number | string)[],
  Record<string, number>,
  number,
  number,
  boolean,
];

export abstract class Parser {
  declare ["constructor"]: typeof Parser & {
    Racc_arg: RaccArg;
    Racc_token_to_s_table: string[];
  };

  /** @internal */
  _racc_state: number[] = [];
  /** @internal */
  _racc_tstack: number[] = [];
  /** @internal */
  _racc_vstack: unknown[] = [];
  /** @internal */
  _racc_t: number | null = null;
  /** @internal */
  _racc_val: unknown = null;
  /** @internal */
  _racc_read_next = true;
  /** @internal */
  _racc_user_yyerror = false;
  /** @internal */
  _racc_error_status = 0;

  /** @internal */
  _raccSetup(): RaccArg {
    const arg = this.constructor.Racc_arg;
    if (arg.length < 14) arg[13] = true;
    return arg;
  }

  /** @internal */
  _raccInitSysvars(): void {
    this._racc_state = [0];
    this._racc_tstack = [];
    this._racc_vstack = [];

    this._racc_t = null;
    this._racc_val = null;

    this._racc_read_next = true;

    this._racc_user_yyerror = false;
    this._racc_error_status = 0;
  }

  doParse(): unknown {
    return this._raccDoParseRb(this._raccSetup(), false);
  }

  nextToken(): [string | false, unknown] | null | undefined {
    throw new Error(`${this.constructor.name}#next_token is not defined`);
  }

  /** @internal */
  _raccDoParseRb(arg: RaccArg, _inDebug: boolean): unknown {
    const [actionTable, actionCheck, actionDefault, actionPointer, , , , , , , tokenTable] = arg;

    this._raccInitSysvars();
    let tok: string | false | undefined;
    let act: number | null | undefined = null;
    let i: number | null = null;

    return kernelCatch(":racc_end_parse", () => {
      while (true) {
        if ((i = actionPointer[this._racc_state.at(-1)!]) != null) {
          if (this._racc_read_next) {
            if (this._racc_t !== 0) {
              [tok, this._racc_val] = this.nextToken() ?? [undefined, undefined];
              if (tok == null || tok === false) {
                this._racc_t = 0;
              } else {
                this._racc_t = tokenTable[tok] ?? 1;
              }
              this._racc_read_next = false;
            }
          }
          i += this._racc_t!;
          if (
            !(
              i >= 0 &&
              (act = actionTable[i]) != null &&
              actionCheck[i] === this._racc_state.at(-1)
            )
          ) {
            act = actionDefault[this._racc_state.at(-1)!];
          }
        } else {
          act = actionDefault[this._racc_state.at(-1)!];
        }
        while ((act = this._raccEvalact(act!, arg)) != null);
      }
    });
  }

  /** @internal */
  _raccEvalact(act: number, arg: RaccArg): number | null {
    const [actionTable, actionCheck, , actionPointer, , , , , , , , shiftN, reduceN] = arg;
    if (act > 0 && act < shiftN) {
      if (this._racc_error_status > 0) {
        if (!(this._racc_t! <= 1)) this._racc_error_status -= 1;
      }
      this._racc_vstack.push(this._racc_val);
      this._racc_state.push(act);
      this._racc_read_next = true;
    } else if (act < 0 && act > -reduceN) {
      const code = kernelCatch(":racc_jump", () => {
        this._racc_state.push(this._raccDoReduce(arg, act));
        return false;
      });
      if (code !== false) {
        switch (code) {
          case 1:
            this._racc_user_yyerror = true;
            return -reduceN;
          case 2:
            return shiftN;
          default:
            throw new Error("[Racc Bug] unknown jump code");
        }
      }
    } else if (act === shiftN) {
      kernelThrow(":racc_end_parse", this._racc_vstack[0]);
    } else if (act === -reduceN) {
      switch (this._racc_error_status) {
        case 0:
          if (!(arg as unknown[])[21]) {
            this.onError(this._racc_t!, this._racc_val, this._racc_vstack);
          }
          break;
        case 3:
          if (this._racc_t === 0) kernelThrow(":racc_end_parse", null);
          this._racc_read_next = true;
      }
      this._racc_user_yyerror = false;
      this._racc_error_status = 3;
      let i: number | null;
      while (true) {
        if ((i = actionPointer[this._racc_state.at(-1)!]) != null) {
          i += 1;
          if (
            i >= 0 &&
            (act = actionTable[i]!) != null &&
            actionCheck[i] === this._racc_state.at(-1)
          ) {
            break;
          }
        }
        if (this._racc_state.length <= 1) kernelThrow(":racc_end_parse", null);
        this._racc_state.pop();
        this._racc_vstack.pop();
      }
      return act;
    } else {
      throw new Error(`[Racc Bug] unknown action ${rbInspect(act)}`);
    }

    return null;
  }

  /** @internal */
  _raccDoReduce(arg: RaccArg, act: number): number {
    const [
      ,
      ,
      ,
      ,
      gotoTable,
      gotoCheck,
      gotoDefault,
      gotoPointer,
      ntBase,
      reduceTable,
      ,
      ,
      ,
      useResult,
    ] = arg;

    const state = this._racc_state;
    const vstack = this._racc_vstack;
    const tstack = this._racc_tstack;

    let i: number | null = act * -3;
    const len = reduceTable[i] as number;
    const reduceTo = reduceTable[i + 1] as number;
    const methodId = reduceTable[i + 2] as string;

    const tmpV = len === 0 ? [] : vstack.splice(-len, len);
    if (len !== 0) state.splice(-len, len);

    const method = (this as unknown as Record<string, (...a: unknown[]) => unknown>)[methodId];
    if (useResult) {
      vstack.push(method.call(this, tmpV, vstack, tmpV[0]));
    } else {
      vstack.push(method.call(this, tmpV, vstack));
    }
    tstack.push(reduceTo);

    const k1 = reduceTo - ntBase;
    if ((i = gotoPointer[k1]) != null) {
      i += state.at(-1)!;
      let curstate: number | null;
      if (i >= 0 && (curstate = gotoTable[i]) != null && gotoCheck[i] === k1) {
        return curstate;
      }
    }
    return gotoDefault[k1]!;
  }

  onError(t: number, val: unknown, _vstack: unknown[]): void {
    throw new ParseError(`parse error on value ${rbInspect(val)} (${this.tokenToStr(t) ?? "?"})`);
  }

  yyerror(): never {
    return kernelThrow(":racc_jump", 1);
  }

  yyaccept(): never {
    return kernelThrow(":racc_jump", 2);
  }

  yyerrok(): void {
    this._racc_error_status = 0;
  }

  tokenToStr(t: number): string | undefined {
    return this.constructor.Racc_token_to_s_table[t];
  }
}
