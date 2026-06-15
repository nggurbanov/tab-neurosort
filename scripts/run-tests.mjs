import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const buildVitestArgs = (args) => (args.length === 0 ? ["run"] : ["run", ...args]);

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  execFileSync("npx", ["vitest", ...buildVitestArgs(process.argv.slice(2))], { stdio: "inherit" });
}
