import { runWithNetworkRetries } from "./network-retry.mjs";

const [command, ...arguments_] = process.argv.slice(2);
if (command === undefined) {
  throw new Error("Usage: node scripts/retry-network-command.mjs COMMAND [ARGUMENT ...]");
}

const result = await runWithNetworkRetries(command, arguments_);
if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`${command} exited with code ${String(result.status)}.`);
}
