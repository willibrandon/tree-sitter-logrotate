import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import logrotateGrammar from "./src/languages/logrotate.tmLanguage.json" with { type: "json" };

const logrotateLanguage = {
  ...logrotateGrammar,
  name: "logrotate",
};
const serverHost = process.env.TREE_SITTER_LOGROTATE_DOCS_HOST ?? false;
const serverPort = Number.parseInt(
  process.env.TREE_SITTER_LOGROTATE_DOCS_PORT ?? "4323",
  10,
);

export default defineConfig({
  site: "https://willibrandon.github.io",
  base: "/tree-sitter-logrotate",
  trailingSlash: "always",
  server: {
    host: serverHost,
    port: serverPort,
  },
  integrations: [
    starlight({
      title: "tree-sitter-logrotate",
      description: "A Logrotate grammar for Tree-sitter",
      favicon: "/favicon.svg",
      credits: false,
      lastUpdated: true,
      editLink: {
        baseUrl:
          "https://github.com/willibrandon/tree-sitter-logrotate/edit/main/docs-site/",
      },
      customCss: ["./src/styles/docs.css"],
      expressiveCode: {
        shiki: {
          langs: ["bash", logrotateLanguage],
        },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/willibrandon/tree-sitter-logrotate",
        },
      ],
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
      sidebar: [
        {
          label: "Use the parser",
          items: [
            { label: "Overview", slug: "" },
            { label: "Playground", slug: "playground" },
            { label: "Getting started", slug: "getting-started" },
            { label: "Bindings", slug: "bindings" },
          ],
        },
        {
          label: "Integrate the grammar",
          items: [
            { label: "Syntax tree", slug: "syntax-tree" },
            { label: "Queries", slug: "queries" },
            { label: "Editors", slug: "editors" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Compatibility", slug: "compatibility" },
            { label: "Troubleshooting", slug: "troubleshooting" },
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
