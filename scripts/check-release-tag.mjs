import { readFile } from "node:fs/promises";
import { packageMetadata, repositoryRoot, run } from "./release-common.mjs";

const metadata = await packageMetadata();
const expectedTag = `v${metadata.version}`;
const actualTag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (actualTag !== expectedTag) {
  throw new Error(`Release tag must be ${expectedTag}, found ${actualTag ?? "no tag"}.`);
}

const head = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim();
const tagged = run("git", ["rev-list", "-n", "1", `refs/tags/${actualTag}`], { capture: true }).stdout.trim();
if (head !== tagged) {
  throw new Error(`${actualTag} points to ${tagged}, not checked-out commit ${head}.`);
}

const tagType = run("git", ["cat-file", "-t", `refs/tags/${actualTag}`], { capture: true }).stdout.trim();
if (tagType !== "tag") {
  throw new Error(`${actualTag} must be an annotated or signed tag.`);
}

const changelog = await readFile(`${repositoryRoot}/CHANGELOG.md`, "utf8");
if (!changelog.includes(`## ${metadata.version}`)) {
  throw new Error(`CHANGELOG.md has no ${metadata.version} section.`);
}

process.stdout.write(`Verified ${actualTag} at ${head}.\n`);
