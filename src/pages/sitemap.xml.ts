import content from "@/data/content.json";

export const prerender = true;

export function GET() {
  const base = "https://www.wisemainecoon.com";
  const urls = [
    { path: "/", updated: new Date().toISOString() },
    ...content.map((item) => ({ path: item.path, updated: item.updated }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url><loc>${base}${item.path}</loc><lastmod>${item.updated.slice(0, 10)}</lastmod></url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
