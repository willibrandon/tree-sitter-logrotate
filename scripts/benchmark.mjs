import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import Parser from "tree-sitter";

import language from "../bindings/node/index.js";

const root = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(process.env.TREE_SITTER_BUILD_DIR ?? resolve(root, "build"));
const outputDirectory = resolve(buildDirectory, "performance");
const budgets = JSON.parse(await readFile(resolve(root, "test/performance/budgets.json"), "utf8"));
const baselinePath = resolve(root, "test/performance/baseline.json");
const writeBaseline = process.argv.includes("--write-baseline");

const parser = new Parser();
parser.setLanguage(language);

const median = values => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const percentile = (values, percentage) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((percentage / 100) * sorted.length) - 1];
};

const parseOnce = source => {
  const started = performance.now();
  const tree = parser.parse(source);
  const elapsedMilliseconds = performance.now() - started;
  assert.equal(tree.rootNode.hasError, false);
  return { tree, elapsedMilliseconds };
};

const measureCold = source => {
  parseOnce(source);
  const samples = Array.from({ length: budgets.samples }, () => parseOnce(source).elapsedMilliseconds);
  const milliseconds = median(samples);
  return {
    bytes: Buffer.byteLength(source),
    milliseconds,
    throughputMegabytesPerSecond: Buffer.byteLength(source) / 1_000_000 / (milliseconds / 1_000),
  };
};

const ordinaryBlocks = count =>
  Array.from(
    { length: count },
    (_, index) => `/var/log/application-${String(index)}.log {\n  daily\n  rotate 4\n  compress\n}\n`,
  ).join("");

const lineConfiguration = count => Array.from({ length: count }, (_, index) => `rotate ${String(index % 100)}\n`).join("");

const largePathList = count =>
  `${Array.from({ length: count }, (_, index) => `/var/log/service-${String(index)}/*.log`).join(" ")} {\n  weekly\n}\n`;

const rawScript = count =>
  `/var/log/application.log {\n  postrotate\n${"    printf '%s\\n' endscript-lookalike\n".repeat(count)}  endscript\n}\n`;

const scalingSources = [25_000, 50_000, 100_000].map(lines => ({
  lines,
  source: lineConfiguration(lines),
}));
const scaling = scalingSources.map(({ lines, source }) => ({ lines, ...measureCold(source) }));
const scalingRatios = scaling.slice(1).map((sample, index) => sample.milliseconds / scaling[index].milliseconds);

const incrementalSource = ordinaryBlocks(10_000);
let incrementalTree = parseOnce(incrementalSource).tree;
let currentSource = incrementalSource;
const candidateOffsets = [];
let searchFrom = 0;
for (;;) {
  const offset = currentSource.indexOf("rotate 4", searchFrom);
  if (offset === -1) break;
  candidateOffsets.push(offset + "rotate ".length);
  searchFrom = offset + 1;
}
const editOffsets = [candidateOffsets[0], candidateOffsets[Math.floor(candidateOffsets.length / 2)], candidateOffsets.at(-1)];
assert.equal(editOffsets.every(offset => offset !== undefined), true);
const incrementalSamples = [];
for (let iteration = 0; iteration < budgets.incrementalIterations; iteration += 1) {
  for (const offset of editOffsets) {
    const replacement = currentSource[offset] === "4" ? "5" : "4";
    const preceding = currentSource.slice(0, offset);
    const row = preceding.split("\n").length - 1;
    const column = offset - (preceding.lastIndexOf("\n") + 1);
    incrementalTree.edit({
      startIndex: offset,
      oldEndIndex: offset + 1,
      newEndIndex: offset + 1,
      startPosition: { row, column },
      oldEndPosition: { row, column: column + 1 },
      newEndPosition: { row, column: column + 1 },
    });
    currentSource = `${currentSource.slice(0, offset)}${replacement}${currentSource.slice(offset + 1)}`;
    const started = performance.now();
    incrementalTree = parser.parse(currentSource, incrementalTree);
    incrementalSamples.push(performance.now() - started);
    assert.equal(incrementalTree.rootNode.hasError, false);
  }
}

const artifact = async name => (await stat(resolve(buildDirectory, name))).size;
const results = {
  schemaVersion: 1,
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
  },
  cold: {
    ordinaryBlocks: measureCold(ordinaryBlocks(10_000)),
    hundredThousandLines: scaling.at(-1),
    largePathList: measureCold(largePathList(20_000)),
    rawScript: measureCold(rawScript(50_000)),
  },
  scaling: {
    samples: scaling,
    maximumDoublingRatio: Math.max(...scalingRatios),
  },
  incremental: {
    edits: incrementalSamples.length,
    medianMilliseconds: median(incrementalSamples),
    p95Milliseconds: percentile(incrementalSamples, 95),
  },
  memory: {
    peakResidentMegabytes: process.resourceUsage().maxRSS / 1024,
  },
  artifacts: {
    parserSourceBytes: (await stat(resolve(root, "src/parser.c"))).size,
    nativeParserBytes: await artifact(`tree-sitter-logrotate.${process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so"}`),
    wasmBytes: await artifact("tree-sitter-logrotate.wasm"),
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "results.json"), `${JSON.stringify(results, null, 2)}\n`);

if (writeBaseline) {
  await writeFile(baselinePath, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`Updated ${baselinePath}.\n`);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
for (const [name, measurement] of Object.entries(results.cold)) {
  assert.ok(
    measurement.throughputMegabytesPerSecond >= budgets.minimumColdThroughputMegabytesPerSecond,
    `${name} throughput ${measurement.throughputMegabytesPerSecond.toFixed(2)} MB/s is below the absolute budget`,
  );
  assert.ok(
    measurement.throughputMegabytesPerSecond >= baseline.cold[name].throughputMegabytesPerSecond * budgets.minimumBaselineThroughputRatio,
    `${name} throughput regressed beyond the baseline budget`,
  );
}
assert.ok(results.scaling.maximumDoublingRatio <= budgets.maximumDoublingRatio, "cold parsing became superlinear");
assert.ok(results.incremental.p95Milliseconds <= budgets.maximumIncrementalP95Milliseconds, "incremental p95 exceeded its budget");
assert.ok(results.memory.peakResidentMegabytes <= budgets.maximumPeakResidentMegabytes, "peak resident memory exceeded its budget");
for (const [name, size] of Object.entries(results.artifacts)) {
  assert.ok(size <= budgets.maximumArtifactBytes[name], `${name} exceeded its size budget`);
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\nPerformance budgets passed.\n`);
