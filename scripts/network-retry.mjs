import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const transientNetworkFailure =
  /(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up|fetch failed|status:\s*50[234]\b|requested URL returned error:\s*50[234]\b)/iu;

export async function runWithNetworkRetries(command, arguments_, options = {}) {
  const maximumAttempts = 3;
  let result;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    result = spawnSync(command, arguments_, {
      ...options,
      encoding: "utf8",
      shell: false,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");

    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const networkFailure = transientNetworkFailure.test(output);
    if (result.status === 0 || result.error !== undefined || !networkFailure) {
      break;
    }

    if (attempt < maximumAttempts) {
      process.stderr.write(
        `Retrying after a network failure (${String(attempt + 1)}/${String(maximumAttempts)}).\n`,
      );
      await setTimeout(attempt * 2_000);
    }
  }

  return result;
}
