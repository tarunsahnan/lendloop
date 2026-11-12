import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { convexProcessEnv, readEnvFile, updateEnvFile } from "./env.mjs";

const SHELL = process.platform === "win32";
const CONVEX_READY_TIMEOUT_MS = 180_000;
const N8N_BASE = process.env.N8N_BASE_URL ?? "http://127.0.0.1:5678";

const existing = readEnvFile();

async function required(name, label) {
  const known = process.env[name] ?? existing[name];
  if (known) return known;
  if (!process.stdin.isTTY) {
    console.error(`Missing ${name}. Add it to .env.local and run this again.`);
    process.exit(1);
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await prompt.question(`${label}: `)).trim();
  prompt.close();
  if (!answer) {
    console.error(`${label} is required.`);
    process.exit(1);
  }
  return answer;
}

function secret(name) {
  return existing[name] ?? randomBytes(32).toString("hex");
}

function issuerFromPublishableKey(key) {
  const encoded = key.replace(/^pk_(test|live)_/, "");
  const domain = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  return `https://${domain}`;
}

function writeN8nCredentials(inbound, outbound) {
  mkdirSync("n8n/.runtime", { recursive: true });
  const file = "n8n/.runtime/credentials.json";
  const credential = (id, name, hmacSecret) => ({
    id,
    name,
    type: "crypto",
    data: { hmacSecret },
  });
  writeFileSync(
    file,
    JSON.stringify([
      credential("LendLoopCredIn01", "LendLoop inbound HMAC", inbound),
      credential("LendLoopCredOut1", "LendLoop outbound HMAC", outbound),
    ]),
  );
  chmodSync(file, 0o600);
}

function startConvex() {
  return spawn("npx", ["convex", "dev"], {
    env: convexProcessEnv(),
    shell: SHELL,
    // Own process group, so stopping it also stops the local backend that convex dev starts.
    detached: !SHELL,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopConvex(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (SHELL) {
    child.kill();
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
  await exited;
}

async function waitForDeployment() {
  const deadline = Date.now() + CONVEX_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const url = readEnvFile().NEXT_PUBLIC_CONVEX_URL;
    if (url) {
      try {
        if ((await fetch(`${url}/version`)).ok) return;
      } catch {
        // Not listening yet.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for the Convex deployment to start.");
}

function setConvexEnv(values) {
  for (const [name, value] of Object.entries(values)) {
    const result = spawnSync("npx", ["convex", "env", "set", name, value], {
      env: convexProcessEnv(),
      shell: SHELL,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(`Could not set ${name} on the Convex deployment.`);
    }
    console.log(`  set ${name}`);
  }
}

function waitForFunctionsReady(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for Convex functions to deploy.")),
      CONVEX_READY_TIMEOUT_MS,
    );
    const watch = (chunk) => {
      if (String(chunk).includes("Convex functions ready")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
  });
}

const publishableKey = await required(
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "Clerk publishable key",
);
const secretKey = await required("CLERK_SECRET_KEY", "Clerk secret key");
const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN ?? issuerFromPublishableKey(publishableKey);

const convexToN8n = secret("CONVEX_TO_N8N_SECRET");
const n8nToConvex = secret("N8N_TO_CONVEX_SECRET");

updateEnvFile({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
  CLERK_SECRET_KEY: secretKey,
  CONVEX_TO_N8N_SECRET: convexToN8n,
  N8N_TO_CONVEX_SECRET: n8nToConvex,
  N8N_ENCRYPTION_KEY: secret("N8N_ENCRYPTION_KEY"),
});
writeN8nCredentials(convexToN8n, n8nToConvex);
console.log("Wrote .env.local and the n8n credentials file.");

console.log("Starting Convex. The first run downloads the local backend.");
const convex = startConvex();
try {
  const ready = waitForFunctionsReady(convex);
  await waitForDeployment();
  setConvexEnv({
    CLERK_JWT_ISSUER_DOMAIN: issuer,
    CONVEX_TO_N8N_SECRET: convexToN8n,
    N8N_TO_CONVEX_SECRET: n8nToConvex,
    N8N_LOAN_EVENT_URL: `${N8N_BASE}/webhook/lendloop-loan-event`,
    N8N_OVERDUE_RUN_URL: `${N8N_BASE}/webhook/lendloop-overdue-run`,
    LENDLOOP_ALLOW_DEMO: "true",
    NOTIFICATION_BACKOFF_SCALE: "0.1",
  });
  await ready;
  console.log("Convex is configured and deployed.");
} finally {
  await stopConvex(convex);
}

console.log("\nNext: npm run n8n:up, then npm run dev");
process.exit(0);
