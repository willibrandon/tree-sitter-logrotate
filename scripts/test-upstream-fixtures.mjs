import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

import Parser from "tree-sitter";

import language from "../bindings/node/index.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(repositoryRoot, "test/fixtures/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const outputRoot = await mkdtemp(resolve(tmpdir(), "tree-sitter-logrotate-fixtures-"));
const parser = new Parser();
parser.setLanguage(language);

function git(checkout, arguments_) {
  const result = spawnSync("git", ["-C", checkout, ...arguments_], {
    encoding: "utf8",
    shell: false,
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(" ")} failed in ${checkout}: ${result.stderr}`,
  );
  return result.stdout;
}

async function resolveCheckout(source) {
  const configuredCheckout = process.env[source.checkoutEnvironment];
  const localCheckout = resolve(repositoryRoot, configuredCheckout ?? source.defaultCheckout);
  if (process.env.TREE_SITTER_FIXTURES_FETCH !== "always") {
    try {
      await access(resolve(localCheckout, ".git"));
      git(localCheckout, ["cat-file", "-e", `${source.revision}^{commit}`]);
      return localCheckout;
    } catch (error) {
      if (configuredCheckout !== undefined) {
        throw new Error(`${source.checkoutEnvironment} does not contain ${source.revision}.`, { cause: error });
      }
    }
  }

  const checkout = resolve(outputRoot, "checkouts", source.id);
  await mkdir(checkout, { recursive: true });
  git(checkout, ["init", "--initial-branch=fixture"]);
  git(checkout, ["remote", "add", "origin", source.repository]);
  git(checkout, ["fetch", "--depth", "1", "origin", source.revision]);
  const fetched = git(checkout, ["rev-parse", "FETCH_HEAD"]).trim();
  assert.equal(fetched, source.revision, `${source.id} fetched an unexpected revision`);
  return checkout;
}

function errorNodes(rootNode) {
  const errors = [];
  const visit = (node) => {
    if (node.isError || node.isMissing) {
      errors.push(node);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(rootNode);
  return errors;
}

try {
  const report = [];
  for (const source of manifest.sources) {
    const checkout = await resolveCheckout(source);

    for (const fixture of source.fixtures) {
      const original = git(checkout, ["show", `${source.revision}:${fixture.path}`]);
      let text = original;
      for (const [needle, replacement] of Object.entries(source.replacements)) {
        text = text.replaceAll(needle, replacement);
      }

      const destination = resolve(outputRoot, source.id, fixture.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, text);

      const tree = parser.parse(text);
      const errors = errorNodes(tree.rootNode);
      if (fixture.classification === "expected-error") {
        assert.ok(errors.length > 0, `${source.id}:${fixture.path} should retain a bounded error`);
        assert.ok(errors.length <= 4, `${source.id}:${fixture.path} produced too many error nodes`);
        for (const error of errors) {
          assert.ok(
            error.endIndex - error.startIndex < Math.max(Buffer.byteLength(text), 2),
            `${source.id}:${fixture.path} error recovery swallowed the whole input`,
          );
        }
      } else {
        assert.equal(
          tree.rootNode.hasError,
          false,
          `${source.id}:${fixture.path} produced ${tree.rootNode.toString()}`,
        );
      }

      report.push({
        source: source.id,
        path: fixture.path,
        classification: fixture.classification,
        revision: source.revision,
        sha256: createHash("sha256").update(text).digest("hex"),
        errors: errors.length,
        copiedAs: `${source.id}/${fixture.path}`,
      });
    }
  }

  const reportPath = resolve(outputRoot, "classification.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const counts = Object.groupBy(report, ({ classification }) => classification);
  process.stdout.write(
    `Classified ${String(report.length)} pinned fixtures: ${Object.entries(counts)
      .map(([name, fixtures]) => `${name}=${String(fixtures.length)}`)
      .join(", ")} (${basename(outputRoot)}).\n`,
  );
} finally {
  await rm(outputRoot, { force: true, recursive: true });
}
