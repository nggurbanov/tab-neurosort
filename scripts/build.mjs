import { build } from "esbuild";
import { rm } from "node:fs/promises";

const outfile = "neurosort.uc.js";
const version = "1.1.19";

await rm(outfile, { force: true });

await build({
  stdin: {
    contents: [
      "import { bootstrap } from './src/main.ts';",
      "bootstrap();"
    ].join("\n"),
    resolveDir: process.cwd(),
    sourcefile: "neurosort-build-entry.ts",
    loader: "ts"
  },
  outfile,
  bundle: true,
  format: "iife",
  globalName: "NeuroSort",
  platform: "browser",
  target: ["es2022"],
  splitting: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  banner: {
    js: [
      `// NeuroSort generated artifact version ${version}`,
      "// ==UserScript==",
      "// @name           NeuroSort",
      "// @description    AI-assisted tab grouping for Zen Browser/Sine",
      `// @version        ${version}`,
      "// @author         Tyrell",
      "// @include        chrome://browser/content/browser.xhtml",
      "// @run-at         browser",
      "// @ignorecache",
      "// ==/UserScript=="
    ].join("\n")
  }
});
