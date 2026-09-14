import { runWithNetworkRetries } from "./network-retry.mjs";

const npmCli = process.env.npm_execpath;
if (npmCli === undefined) {
  throw new Error("npm_execpath is required; run this installer through npm run ci:install.");
}

const result = await runWithNetworkRetries(process.execPath, [npmCli, "ci"]);

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`npm ci exited with code ${String(result.status)}.`);
}
