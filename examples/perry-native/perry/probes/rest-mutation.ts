function popLast(args: unknown[]): string {
  const before = args.length;
  const last = args[args.length - 1];
  const popped = args.pop();
  return `before=${before} last=${JSON.stringify(last)} popped=${JSON.stringify(popped)} after=${args.length} rem=${JSON.stringify(args)}`;
}
function reader(...syms: unknown[]): string {
  const detail = popLast(syms);
  let seen = 0;
  for (const s of syms) {
    void s;
    seen += 1;
  }
  return `${detail} loopRan=${seen}`;
}
function accessor(...syms: unknown[]): string {
  const opts = syms.pop();
  return `A opts=${JSON.stringify(opts)} names=${JSON.stringify(syms)} -> ${reader(...syms, opts)}`;
}
console.log(`R1 direct rest pop : ${reader("attr", { d: 1 })}`);
console.log(`R2 nested like mattr: ${accessor("attr", { d: 1 })}`);
const arr: unknown[] = ["attr", { d: 1 }];
console.log(`R3 spread into rest: ${accessor(...arr)}`);
