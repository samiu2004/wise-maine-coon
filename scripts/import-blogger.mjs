import fs from "node:fs";
import path from "node:path";
import { xml2js } from "xml-js";

const feedPath = "/tmp/wmc-migration/extracted/Takeout/Blogger/Blogs/Wise Maine Coon/feed.atom";
const projectRoot = "/workspace/scratch/2817fc182e05/wisemainecoon-site";
const feedXml = fs.readFileSync(feedPath, "utf8");
const doc = xml2js(feedXml, { compact: true, trim: false, alwaysArray: false });
const entries = Array.isArray(doc.feed.entry) ? doc.feed.entry : [doc.feed.entry];

const descriptions = {
  "/2026/09/maine-coon-litter-box-guide.html": "Choose a Maine Coon litter box using usable interior size, entry height and setup—not an XL label alone.",
  "/2026/08/maine-coon-size-growth-guide.html": "Understand Maine Coon growth, adult size ranges and how to track development without relying on one rigid chart.",
  "/2026/08/maine-coon-personality-temperament.html": "A practical guide to Maine Coon personality, social behavior, play, communication and life with families and other pets.",
  "/2026/08/maine-coon-lifespan.html": "Learn the typical Maine Coon lifespan, important health risks and practical ways to support long-term wellbeing.",
  "/2026/08/maine-coon-grooming-guide.html": "Build a workable Maine Coon grooming routine for brushing, shedding, mats, bathing, nails and coat care.",
  "/2026/08/maine-coon-food-guide.html": "Understand Maine Coon feeding by life stage, body condition, food labels and portion adjustment.",
  "/2026/08/maine-coon-care-guide.html": "Use this daily, weekly and annual Maine Coon care routine to organize grooming, enrichment, hygiene and preventive care.",
  "/p/about-wise-maine-coon.html": "Learn how Wise Maine Coon researches practical guidance for prospective and first-time Maine Coon owners.",
  "/p/contact.html": "Contact Wise Maine Coon with corrections, questions or collaboration ideas.",
  "/p/editorial-policy.html": "Read the Wise Maine Coon editorial policy, research standards and correction process.",
  "/p/privacy-policy.html": "Read how Wise Maine Coon handles analytics, cookies and personal information.",
  "/p/disclaimer.html": "Read the Wise Maine Coon medical, product, affiliate and external-link disclaimer."
};

function text(node) {
  if (!node) return "";
  return typeof node === "string" ? node : (node._cdata ?? node._text ?? "");
}

function labels(entry) {
  const values = entry.category ? (Array.isArray(entry.category) ? entry.category : [entry.category]) : [];
  return values.map((item) => item?._attributes?.term).filter(Boolean);
}

function cleanHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/^\s*<p><strong>By Sami[^<]*<\/strong><\/p>\s*/i, "")
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/<img\b(?![^>]*\bloading=)([^>]*)>/gi, '<img loading="lazy" decoding="async"$1>')
    .replace(/href="http:\/\/www\.wisemainecoon\.com/gi, 'href="https://www.wisemainecoon.com')
    .trim();
}

function imageUrls(html) {
  return [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
}

const content = entries.map((entry) => {
  const pagePath = text(entry["blogger:filename"]);
  const html = cleanHtml(text(entry.content));
  return {
    id: text(entry.id),
    type: text(entry["blogger:type"]),
    status: text(entry["blogger:status"]),
    title: text(entry.title),
    path: pagePath,
    description: descriptions[pagePath] ?? "Practical, research-based guidance from Wise Maine Coon.",
    published: text(entry.published),
    updated: text(entry.updated),
    labels: labels(entry),
    heroImage: imageUrls(html)[0] ?? null,
    html
  };
}).sort((a, b) => b.published.localeCompare(a.published));

const dataDir = path.join(projectRoot, "src/data");
const pagesDir = path.join(projectRoot, "src/pages");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(pagesDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "content.json"), `${JSON.stringify(content, null, 2)}\n`);

for (const page of content) {
  const relativePath = page.path.replace(/^\//, "");
  const sourceRoute = relativePath.replace(/\.html$/, "");
  const filePath = path.join(pagesDir, `${sourceRoute}.astro`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const source = `---\nimport ContentPage from "@/components/ContentPage.astro";\nimport content from "@/data/content.json";\nconst page = content.find((item) => item.path === ${JSON.stringify(page.path)});\nif (!page) throw new Error("Missing imported page: ${page.path}");\n---\n<ContentPage page={page} />\n`;
  fs.writeFileSync(filePath, source);
}

console.log(`Imported ${content.length} live entries.`);
