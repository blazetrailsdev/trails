import { rbEnsure } from "./ensure.js";

/**
 * What `PrettyPrint` appends to with `<<` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:84`):
 * a String or an IO. A JS string cannot be appended to in place, so the
 * output is anything answering `write`, which is `IO#<<`
 * (`vendor/ruby/v3.3.11/io.c:2323`).
 *
 * @noRailsEquivalent PERMANENT — the `output` argument of Ruby stdlib
 * `PrettyPrint.new` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:84`).
 */
export interface PrettyPrintOutput {
  write(string: string): unknown;
}

/**
 * Ruby's `PrettyPrint` (stdlib `vendor/ruby/v3.3.11/lib/prettyprint.rb:34`), Oppen's
 * pretty-printing algorithm. Rails defines none of it and calls it through
 * `PP` from `Core#pretty_print` (`activerecord/src/core.ts`).
 *
 * A block that reads an association is async, so {@link group},
 * {@link groupSub} and {@link nest} return the block's promise and restore
 * their state when it settles.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `PrettyPrint`
 * (`vendor/ruby/v3.3.11/lib/prettyprint.rb:34`).
 */
export class PrettyPrint {
  /** @noRailsEquivalent PERMANENT — `attr_reader :output` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:103`). */
  readonly output: PrettyPrintOutput;
  /** @noRailsEquivalent PERMANENT — `attr_reader :maxwidth` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:108`). */
  readonly maxwidth: number;
  /** @noRailsEquivalent PERMANENT — `attr_reader :newline` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:113`). */
  readonly newline: string;
  /** @noRailsEquivalent PERMANENT — `attr_reader :indent` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:123`). */
  indent = 0;
  /** @noRailsEquivalent PERMANENT — `attr_reader :group_queue` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:126`). */
  readonly groupQueue: GroupQueue;
  private outputWidth = 0;
  private bufferWidth = 0;
  private buffer: (Text | Breakable)[] = [];
  private groupStack: Group[];

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#initialize` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:84`). */
  constructor(output: PrettyPrintOutput, maxwidth = 79, newline = "\n") {
    this.output = output;
    this.maxwidth = maxwidth;
    this.newline = newline;
    const rootGroup = new Group(0);
    this.groupStack = [rootGroup];
    this.groupQueue = new GroupQueue(rootGroup);
  }

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#current_group` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:157`). */
  currentGroup(): Group {
    return this.groupStack[this.groupStack.length - 1];
  }

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#break_outmost_groups` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:162`). */
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

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#text` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:182`). */
  text(obj: string, width = obj.length): void {
    if (this.buffer.length === 0) {
      this.output.write(obj);
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

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#breakable` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:226`). */
  breakable(sep = " ", width = sep.length): void {
    const group = this.groupStack[this.groupStack.length - 1];
    if (group.isBreak()) {
      this.flush();
      this.output.write(this.newline);
      this.output.write(" ".repeat(this.indent));
      this.outputWidth = this.indent;
      this.bufferWidth = 0;
    } else {
      this.buffer.push(new Breakable(sep, width, this));
      this.bufferWidth += width;
      this.breakOutmostGroups();
    }
  }

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#group` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:251`). */
  async group(
    indent = 0,
    openObj = "",
    closeObj = "",
    block: () => void | Promise<void>,
  ): Promise<void> {
    this.text(openObj);
    await this.groupSub(() => this.nest(indent, block));
    this.text(closeObj);
  }

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#group_sub` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:262`). */
  groupSub<T>(block: () => T): T {
    const group = new Group(this.groupStack[this.groupStack.length - 1].depth + 1);
    this.groupStack.push(group);
    this.groupQueue.enq(group);
    return rbEnsure(block, () => {
      this.groupStack.pop();
      if (group.breakables.length === 0) this.groupQueue.delete(group);
    });
  }

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#nest` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:279`). */
  nest<T>(indent: number, block: () => T): T {
    this.indent += indent;
    return rbEnsure(block, () => {
      this.indent -= indent;
    });
  }

  /** @noRailsEquivalent PERMANENT — `PrettyPrint#flush` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:290`). */
  flush(): void {
    for (const data of this.buffer) {
      this.outputWidth = data.output(this.output, this.outputWidth);
    }
    this.buffer.length = 0;
    this.bufferWidth = 0;
  }
}

/** `PrettyPrint::Text` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:301`). */
class Text {
  private objs: string[] = [];
  width = 0;

  output(out: PrettyPrintOutput, outputWidth: number): number {
    for (const obj of this.objs) out.write(obj);
    return outputWidth + this.width;
  }

  add(obj: string, width: number): void {
    this.objs.push(obj);
    this.width += width;
  }
}

/** `PrettyPrint::Breakable` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:339`). */
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

  output(out: PrettyPrintOutput, outputWidth: number): number {
    this.group.breakables.shift();
    if (this.group.isBreak()) {
      out.write(this.pp.newline);
      out.write(" ".repeat(this.indent));
      return this.indent;
    } else {
      if (this.group.breakables.length === 0) this.pp.groupQueue.delete(this.group);
      out.write(this.obj);
      return outputWidth + this.width;
    }
  }
}

/** `PrettyPrint::Group` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:396`). */
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

/** `PrettyPrint::GroupQueue` (`vendor/ruby/v3.3.11/lib/prettyprint.rb:442`). */
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
