export default {
  "*.{js,jsx,mjs,cjs,ts,tsx}": (files) => {
    const lintable = files.filter((f) => !f.includes("__fixtures__"));
    const cmds = [];
    if (lintable.length > 0) cmds.push(`eslint --fix ${lintable.join(" ")}`);
    cmds.push(`prettier --write ${files.join(" ")}`);
    return cmds;
  },
  "*.{json,md,yml,yaml,css,scss}": ["prettier --write"],
  // The non-JS/TS half of blazetrails/no-raw-control-bytes: ESLint only parses
  // JS/TS, and a raw control byte anywhere else hides the file from grep just
  // as silently. CI's Preflight job runs the same script over the whole tree,
  // so this is the fast local echo, not the gate.
  "*": ["scripts/ci/check-control-bytes.sh"],
};
