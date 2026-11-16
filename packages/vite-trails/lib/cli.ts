import {
  defineModule,
  Dir,
  File,
  Pathname,
  rbCallSuper,
  rbFRequireFile,
  stderr as $stderr,
} from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import type { Config } from "@blazetrails/vite-assets/config.js";
import { CLI as ViteAssetsCLI } from "@blazetrails/vite-assets/cli.js";
import { ViteTrails } from "./vite-trails.js";

type Path = Pathname | string;

interface InstallHost {
  config(): Promise<Config>;
  root(): Promise<Pathname>;
  cp(source: Path, destination: Path): Promise<void>;
  appendUnlessPresent(path: Path, contents: string, options: { pattern: string }): Promise<void>;
  injectLineAfter(path: Path, target: string, contents: string): Promise<void>;
  injectLineBefore(path: Path, target: string, contents: string): Promise<void>;
  replaceFirstLine(path: Path, target: string, replacement: string): Promise<void>;
  setupContentSecurityPolicy(cspFile: Pathname): Promise<void>;
}

async function call(this: object, options: Record<string, unknown>): Promise<unknown> {
  await (this as { ensureTrailsInit(): Promise<void> }).ensureTrailsInit();
  return rbCallSuper(this, call, options);
}

/** @internal */
async function ensureTrailsInit(): Promise<void> {
  try {
    await rbFRequireFile(File.expandPath("config/environment", Dir.pwd()));
  } catch (error) {
    $stderr.write(
      `Unable to initialize Trails application before Vite build:\n\n\t${(error as Error).message}\n\n`,
    );
  }
}

const Build = defineModule({ call }, {}, { ensureTrailsInit });

const TRAILS_TEMPLATES = new Pathname(
  decodeURIComponent(new URL("../templates", import.meta.url).pathname),
);

async function setupAppFiles(this: InstallHost): Promise<void> {
  const config = await this.config();
  const root = await this.root();
  await this.cp(Install.TRAILS_TEMPLATES.join("config/trails-vite.json"), config.configPath);
  let dir: string | undefined;
  for (const path of ["app/javascript", "app/packs"]) {
    if (await File.isExistAsync(root.join(path).toString())) {
      dir = path;
      break;
    }
  }
  if (dir) {
    await this.replaceFirstLine(
      config.configPath,
      "app/frontend",
      `    "sourceCodeDir": "${dir}",`,
    );
  }
  await this.setupContentSecurityPolicy(
    root.join("config/initializers/content-security-policy.ts"),
  );
  await this.appendUnlessPresent(root.join("Procfile.dev"), "web: bin/trails s", {
    pattern: "web:",
  });
}

/** @internal */
async function setupContentSecurityPolicy(this: InstallHost, cspFile: Pathname): Promise<void> {
  if (!(await File.isExistAsync(cspFile.toString()))) return;

  await this.injectLineAfter(
    cspFile,
    "scriptSrc",
    `    // You may need to enable this in production as well depending on your setup.
//    scriptSrc: [...scriptSrc, "blob:"] if Trails.env.isTest()
`,
  );
  await this.injectLineAfter(
    cspFile,
    "connectSrc",
    `    // Allow @vite/client to hot reload changes in development
//    connectSrc: [...connectSrc, \`ws://\${ViteAssets.config().hostWithPort}\`] if Trails.env.isDevelopment()
`,
  );
  await this.injectLineAfter(
    cspFile,
    "scriptSrc",
    `    // Allow @vite/client to hot reload javascript changes in development
//    scriptSrc: [...scriptSrc, "'unsafe-eval'", \`http://\${ViteAssets.config().hostWithPort}\`] if Trails.env.isDevelopment()
`,
  );
  await this.injectLineAfter(
    cspFile,
    "styleSrc",
    `    // Allow @vite/client to hot reload style changes in development
//    styleSrc: [...styleSrc, "'unsafe-inline'"] if Trails.env.isDevelopment()
`,
  );
}

async function installSampleFiles(this: InstallHost): Promise<void> {
  const config = await this.config();
  if (
    !(await File.isExistAsync(config.resolvedEntrypointsDir().join("application.js").toString()))
  ) {
    await this.cp(
      Install.TRAILS_TEMPLATES.join("entrypoints/application.js"),
      config.resolvedEntrypointsDir().join("application.js"),
    );
  }

  const layoutFile = (await this.root()).join("app/views/layouts/application.html.tse");
  if (await File.isExistAsync(layoutFile.toString())) {
    await this.injectLineBefore(
      layoutFile,
      "</head>",
      `    <%= await viteClientTag() %>
    <%= await viteJavascriptTag("application") %>
    <!--
      If using a TypeScript entrypoint file:
        viteTypescriptTag("application")

      If using a .jsx or .tsx entrypoint, add the extension:
        viteJavascriptTag("application.jsx")

      Visit the guide for more information: https://vite-ruby.netlify.app/guide/rails
    -->
`,
    );
  }
}

const Install = defineModule(
  { TRAILS_TEMPLATES, setupAppFiles, installSampleFiles },
  {},
  { setupContentSecurityPolicy },
);

export const CLI = { Build, Install };

prepend(ViteAssetsCLI.Build, CLI.Build);
prepend(ViteAssetsCLI.Install, CLI.Install);

ViteTrails.CLI = CLI;
