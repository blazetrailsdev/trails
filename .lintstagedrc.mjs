export default {
  "*.{js,jsx,ts,tsx}": (files) => {
    const lintable = files.filter((f) => !f.includes("__fixtures__"));
    const cmds = [];
    if (lintable.length > 0) cmds.push(`eslint --fix ${lintable.join(" ")}`);
    cmds.push(`prettier --write ${files.join(" ")}`);
    return cmds;
  },
  "*.{json,md,yml,yaml,css,scss}": ["prettier --write"],
};
