import fs from "node:fs";
import path from "node:path";
import content from "../src/data/content.json" with { type: "json" };

const root = path.resolve("dist");
const expected = ["/", "/maine-coon-litter-box-comparison.html", ...content.map((item) => item.path)];
const failures = [];

function outputFile(urlPath) {
  if (urlPath === "/") return path.join(root, "index.html");
  return path.join(root, urlPath.replace(/^\//, ""));
}

for (const urlPath of expected) {
  const file = outputFile(urlPath);
  if (!fs.existsSync(file)) {
    failures.push(`Missing output: ${urlPath}`);
    continue;
  }
  const html = fs.readFileSync(file, "utf8");
  const canonical = `https://www.wisemainecoon.com${urlPath}`;
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) failures.push(`Wrong canonical: ${urlPath}`);
  if (!/<meta name="description" content="[^"]+">/.test(html)) failures.push(`Missing description: ${urlPath}`);
  if ((html.match(/<h1\b/g) ?? []).length !== 1) failures.push(`Expected one H1: ${urlPath}`);
  if (/<meta[^>]+noindex/i.test(html)) failures.push(`Unexpected noindex: ${urlPath}`);

  for (const match of html.matchAll(/<a\b[^>]*href="(\/[^"]*)"/g)) {
    const href = match[1].split(/[?#]/)[0];
    if (!href || href === "/" || href.startsWith("/_astro/") || href === "/favicon.svg") continue;
    const target = outputFile(href);
    if (!fs.existsSync(target)) failures.push(`Broken internal link from ${urlPath} to ${href}`);
  }
}

for (const required of ["robots.txt", "sitemap.xml", "favicon.svg", "404.html"]) {
  if (!fs.existsSync(path.join(root, required))) failures.push(`Missing required asset: ${required}`);
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const sitemapPaths = [...sitemap.matchAll(/<loc>https:\/\/www\.wisemainecoon\.com([^<]+)<\/loc>/g)].map((match) => match[1]);
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const publishedHtml = [];
function collectPublicHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "preview") collectPublicHtml(full);
    } else if (entry.name.endsWith(".html") && entry.name !== "404.html") {
      const route = `/${path.relative(root, full).split(path.sep).join("/")}`;
      publishedHtml.push(route === "/index.html" ? "/" : route);
    }
  }
}
collectPublicHtml(root);
for (const urlPath of publishedHtml) {
  if (!sitemapPaths.includes(urlPath)) failures.push(`Published page missing from sitemap: ${urlPath}`);
  if (urlPath.startsWith("/2026/") && !content.some((item) => item.path === urlPath) &&
      !homepage.includes(`href="${urlPath}"`)) {
    failures.push(`New article missing from homepage: ${urlPath}`);
  }
}
for (const urlPath of sitemapPaths) {
  if (!publishedHtml.includes(urlPath)) failures.push(`Non-public route in sitemap: ${urlPath}`);
}
if (new Set(sitemapPaths).size !== sitemapPaths.length) failures.push("Duplicate sitemap URL");

const doubledExtensions = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (entry.name.endsWith(".html.html")) doubledExtensions.push(full);
  }
}
scan(root);
if (doubledExtensions.length) failures.push(`Double HTML extensions: ${doubledExtensions.join(", ")}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Verified ${expected.length} canonical pages and required SEO assets.`);
