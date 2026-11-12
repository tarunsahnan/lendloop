import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";

export function readEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  const entries = readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*?)(?:\s+#.*)?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]);
  return Object.fromEntries(entries);
}

/** Adds or replaces keys and leaves every other line, including comments, as it was. */
export function updateEnvFile(values) {
  const lines = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, "utf8").split("\n")
    : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      lines[index] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  writeFileSync(ENV_FILE, `${lines.join("\n").trim()}\n`);
  chmodSync(ENV_FILE, 0o600);
}

/** A deployment that is not linked to a Convex account runs without any login prompt. */
export function convexProcessEnv() {
  const deployment = readEnvFile().CONVEX_DEPLOYMENT;
  return !deployment || deployment.startsWith("anonymous")
    ? { ...process.env, CONVEX_AGENT_MODE: "anonymous" }
    : process.env;
}
