/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: pp. */
import { rbAnyToS, rbInspect } from "@blazetrails/ruby-compat";

export interface PrettyPrinter {
  text(str: string): void;
  breakable(sep?: string): void;
  group(indent: number, open: string, close: string, fn: () => void | Promise<void>): Promise<void>;
  seplist<I>(
    list: I[],
    sep: (() => void) | null,
    fn: (item: I) => void | Promise<void>,
  ): Promise<void>;
  objectAddressGroup(obj: object, fn: () => void | Promise<void>): Promise<void>;
  pp(obj: unknown): Promise<void>;
}

interface HasPrettyPrint {
  prettyPrint(pp: PrettyPrinter): void | Promise<void>;
}

function hasPrettyPrint(obj: unknown): obj is HasPrettyPrint {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as { prettyPrint?: unknown }).prettyPrint === "function"
  );
}

class Text {
  private objs: string[] = [];
  width = 0;

  output(out: { buf: string }, outputWidth: number): number {
    for (const obj of this.objs) out.buf += obj;
    return outputWidth + this.width;
  }

  add(obj: string, width: number): void {
    this.objs.push(obj);
    this.width += width;
  }
}

class Breakable {
  readonly obj: string;
  readonly width: number;
  readonly indent: number;
  private pp: PrettyPrint;
  private group: Group;

  constructor(sep: string, width: number, q: PrettyPrint) {
    this.obj = sep;
    this.width = width;
    this.pp = q;
    this.indent = q.indent;
    this.group = q.currentGroup();
    this.group.breakables.push(this);
  }

  output(out: { buf: string }, outputWidth: number): number {
    this.group.breakables.shift();
    if (this.group.isBreak()) {
      out.buf += this.pp.newline;
      out.buf += " ".repeat(this.indent);
      return this.indent;
    } else {
      if (this.group.breakables.length === 0) this.pp.groupQueue.delete(this.group);
      out.buf += this.obj;
      return outputWidth + this.width;
    }
  }
}

class Group {
  readonly depth: number;
  readonly breakables: Breakable[] = [];
  private _break = false;

  constructor(depth: number) {
    this.depth = depth;
  }

  break(): void {
    this._break = true;
  }

  isBreak(): boolean {
    return this._break;
  }

  private _first?: boolean;

  isFirst(): boolean {
    if (this._first !== undefined) {
      return false;
    } else {
      this._first = false;
      return true;
    }
  }
}

class GroupQueue {
  private queue: Group[][] = [];

  constructor(...groups: Group[]) {
    for (const g of groups) this.enq(g);
  }

  enq(group: Group): void {
    const depth = group.depth;
    while (!(depth < this.queue.length)) this.queue.push([]);
    this.queue[depth].push(group);
  }

  deq(): Group | null {
    for (const gs of this.queue) {
      for (let i = gs.length - 1; i >= 0; i--) {
        if (gs[i].breakables.length !== 0) {
          const group = gs.splice(i, 1)[0];
          group.break();
          return group;
        }
      }
      for (const group of gs) group.break();
      gs.length = 0;
    }
    return null;
  }

  delete(group: Group): void {
    const gs = this.queue[group.depth];
    const i = gs.indexOf(group);
    if (i >= 0) gs.splice(i, 1);
  }
}

class PrettyPrint implements PrettyPrinter {
  readonly output: { buf: string } = { buf: "" };
  readonly maxwidth: number;
  readonly newline: string;
  indent = 0;
  readonly groupQueue: GroupQueue;
  private outputWidth = 0;
  private bufferWidth = 0;
  private buffer: (Text | Breakable)[] = [];
  private groupStack: Group[];

  constructor(maxwidth = 79, newline = "\n") {
    this.maxwidth = maxwidth;
    this.newline = newline;
    const rootGroup = new Group(0);
    this.groupStack = [rootGroup];
    this.groupQueue = new GroupQueue(rootGroup);
  }

  currentGroup(): Group {
    return this.groupStack[this.groupStack.length - 1];
  }

  breakOutmostGroups(): void {
    while (this.maxwidth < this.outputWidth + this.bufferWidth) {
      const group = this.groupQueue.deq();
      if (!group) return;
      while (group.breakables.length !== 0) {
        const data = this.buffer.shift()!;
        this.outputWidth = data.output(this.output, this.outputWidth);
        this.bufferWidth -= data.width;
      }
      while (this.buffer.length !== 0 && this.buffer[0] instanceof Text) {
        const text = this.buffer.shift()!;
        this.outputWidth = text.output(this.output, this.outputWidth);
        this.bufferWidth -= text.width;
      }
    }
  }

  text(obj: string, width = obj.length): void {
    if (this.buffer.length === 0) {
      this.output.buf += obj;
      this.outputWidth += width;
    } else {
      let text = this.buffer[this.buffer.length - 1];
      if (!(text instanceof Text)) {
        text = new Text();
        this.buffer.push(text);
      }
      text.add(obj, width);
      this.bufferWidth += width;
      this.breakOutmostGroups();
    }
  }

  breakable(sep = " ", width = sep.length): void {
    const group = this.groupStack[this.groupStack.length - 1];
    if (group.isBreak()) {
      this.flush();
      this.output.buf += this.newline;
      this.output.buf += " ".repeat(this.indent);
      this.outputWidth = this.indent;
      this.bufferWidth = 0;
    } else {
      this.buffer.push(new Breakable(sep, width, this));
      this.bufferWidth += width;
      this.breakOutmostGroups();
    }
  }

  async group(
    indent = 0,
    openObj = "",
    closeObj = "",
    fn: () => void | Promise<void>,
  ): Promise<void> {
    this.text(openObj);
    await this.groupSub(() => this.nest(indent, fn));
    this.text(closeObj);
  }

  async groupSub(fn: () => void | Promise<void>): Promise<void> {
    const group = new Group(this.groupStack[this.groupStack.length - 1].depth + 1);
    this.groupStack.push(group);
    this.groupQueue.enq(group);
    try {
      await fn();
    } finally {
      this.groupStack.pop();
      if (group.breakables.length === 0) this.groupQueue.delete(group);
    }
  }

  async nest(indent: number, fn: () => void | Promise<void>): Promise<void> {
    this.indent += indent;
    try {
      await fn();
    } finally {
      this.indent -= indent;
    }
  }

  flush(): void {
    for (const data of this.buffer) {
      this.outputWidth = data.output(this.output, this.outputWidth);
    }
    this.buffer.length = 0;
    this.bufferWidth = 0;
  }

  commaBreakable(): void {
    this.text(",");
    this.breakable();
  }

  async seplist<I>(
    list: I[],
    sep: (() => void) | null,
    fn: (item: I) => void | Promise<void>,
  ): Promise<void> {
    sep ??= () => this.commaBreakable();
    let first = true;
    for (const item of list) {
      if (first) {
        first = false;
      } else {
        sep();
      }
      await fn(item);
    }
  }

  async objectAddressGroup(obj: object, fn: () => void | Promise<void>): Promise<void> {
    const str = rbAnyToS(obj).replace(/>$/, "");
    await this.group(1, str, ">", fn);
  }

  async pp(obj: unknown): Promise<void> {
    await this.group(0, "", "", async () => {
      if (hasPrettyPrint(obj)) {
        await obj.prettyPrint(this);
      } else if (Array.isArray(obj)) {
        await this.group(1, "[", "]", () => this.seplist(obj, null, (item) => this.pp(item)));
      } else {
        this.text(rbInspect(obj));
      }
    });
  }
}

export interface PPSink {
  write(str: string): void;
}

export async function pp(obj: unknown, io?: PPSink, width = 79): Promise<string> {
  const q = new PrettyPrint(width);
  await q.pp(obj);
  q.flush();
  const out = q.output.buf;
  io?.write(`${out}\n`);
  return out;
}
