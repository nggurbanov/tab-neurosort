import { execFileSync } from "node:child_process";

const scripts = [
  "validate:artifact",
  "validate:manifest",
  "validate:preferences",
  "validate:docs",
  "validate:security"
];

for (const script of scripts) {
  execFileSync("npm", ["run", script, "--silent"], { stdio: "inherit" });
}

console.log("validate: implemented validators passed");
