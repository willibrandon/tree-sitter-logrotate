import { createHash } from "node:crypto";

const urlNamespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

const uuidV5 = (name) => {
  const bytes = createHash("sha1").update(urlNamespace).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

export const createReleaseSbom = ({ components, version }) => ({
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${uuidV5(`https://github.com/willibrandon/tree-sitter-logrotate/releases/tag/v${version}`)}`,
  version: 1,
  metadata: {
    component: {
      type: "library",
      "bom-ref": `pkg:github/willibrandon/tree-sitter-logrotate@${version}`,
      name: "tree-sitter-logrotate",
      version,
      licenses: [{ license: { id: "MIT" } }],
      purl: `pkg:github/willibrandon/tree-sitter-logrotate@${version}`,
    },
    properties: [{ name: "tree-sitter:language-abi", value: "15" }],
  },
  components,
});
