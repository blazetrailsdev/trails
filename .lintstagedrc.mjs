export default {
  "*.{js,jsx,mjs,cjs,ts,tsx}": (files) => {
    const lintable = files.filter((f) => !f.includes("__fixtures__"));
    const cmds = [];
    if (lintable.length > 0) cmds.push(`eslint --fix ${lintable.join(" ")}`);
    cmds.push(`prettier --write ${files.join(" ")}`);
    return cmds;
  },
  "*.{json,json5,jsonc,md,mdx,yml,yaml,css,scss,less,html,htm,vue,svelte,graphql,gql,hbs,handlebars}":
    ["prettier --write --ignore-unknown"],
  "*": ["scripts/ci/check-control-bytes.sh"],
};
