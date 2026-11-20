import { DSL } from "@blazetrails/rake";
import { block, File, Pathname, rbFSystem, TopLevel } from "@blazetrails/ruby-compat";

const STYLESHEETS: Record<string, [string, string, string]> = {
  tailwind: ["tailwindcss @tailwindcss/vite", "application.css", `@import "tailwindcss";\n`],
  bootstrap: ["bootstrap sass", "application.scss", `@use "bootstrap/scss/bootstrap";\n`],
  bulma: ["bulma sass", "application.scss", `@use "bulma/sass";\n`],
  postcss: ["postcss autoprefixer", "application.css", ""],
  sass: ["sass", "application.scss", ""],
};

async function install(css: string): Promise<void> {
  const [packages, stylesheet, content] = STYLESHEETS[css];
  const root = new Pathname(TopLevel.Trails!.root()!);
  await rbFSystem(`pnpm add -D ${packages}`);

  const entrypoint = root.join("app/javascript/entrypoints", stylesheet);
  if (!(await File.isExistAsync(entrypoint.toString())))
    await File.writeAsync(entrypoint.toString(), content);

  const js = root.join("app/javascript/entrypoints/application.js").toString();
  if (await File.isExistAsync(js))
    await File.writeAsync(js, `import "./${stylesheet}"\n`, { mode: "a" });

  if (css === "postcss")
    await File.writeAsync(
      root.join("postcss.config.js").toString(),
      `export default { plugins: { autoprefixer: {} } }\n`,
    );

  if (css === "tailwind") {
    const config = root.join("vite.config.ts").toString();
    if (await File.isExistAsync(config)) {
      const source = await File.readAsync(config);
      await File.writeAsync(
        config,
        `import tailwindcss from "@tailwindcss/vite"\n` +
          source.replace(/plugins: \[\n/, `plugins: [\n    tailwindcss(),\n`),
      );
    }
  }
}

DSL.namespace("css", () => {
  DSL.namespace("install", () => {
    for (const css of Object.keys(STYLESHEETS)) {
      DSL.desc(`Install ${css} through Vite`);
      DSL.task(
        css,
        block(() => install(css)),
      );
    }
  });
});
