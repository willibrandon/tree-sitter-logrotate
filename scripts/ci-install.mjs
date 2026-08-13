import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const npmCli = process.env.npm_execpath;
if (npmCli === undefined) {
  throw new Error("npm_execpath is required; run this installer through npm run ci:install.");
}

const maximumAttempts = 3;
let result;

for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
  result = spawnSync(process.execPath, [npmCli, "ci"], {
    encoding: "utf8",
    shell: false,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const networkFailure = /(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|fetch failed)/u.test(output);
  if (result.status === 0 || result.error !== undefined || !networkFailure) {
    break;
  }

  if (attempt < maximumAttempts) {
    process.stderr.write(`Retrying npm ci after a network failure (${String(attempt + 1)}/${String(maximumAttempts)}).\n`);
    await setTimeout(attempt * 2_000);
  }
}

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`npm ci exited with code ${String(result.status)}.`);
}
