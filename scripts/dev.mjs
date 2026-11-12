import { spawn } from "node:child_process";
import { convexProcessEnv } from "./env.mjs";

const shell = process.platform === "win32";

const children = [
  spawn("npx", ["convex", "dev"], { stdio: "inherit", env: convexProcessEnv(), shell }),
  spawn("npx", ["next", "dev"], { stdio: "inherit", shell }),
];

function stop() {
  for (const child of children) child.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", stop);
