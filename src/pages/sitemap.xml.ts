export const prerender = true;

// Discover every published Astro page. Preview and error routes stay out.
const routes = import.meta.glob("/src/pages/**/*.astro", { eager: true });

function publicPath(file: string) {
  const route = file.replace(/^\/src\/pages/, "").replace(/\.astro$/, "");
  if (route === "/index") return "/";
  if (route === "/404" || route.startsWith("/preview/")) return null;
  return `${route}.html`;
}

export function GET() {
  const base = "https://www.wisemainecoon.com";
  const urls = Object.entries(routes).map(([file, listing]) => {
    const path = publicPath(file);
    if (!path) return null;
    const metadata = (listing as { listing?: { published?: string; updated?: string } }).listing;
    // Omit lastmod if the date of the last significant change is unknown.
    const updated = metadata?.updated ?? metadata?.published;
    return { path, updated };
  }).filter((entry): entry is { path: string; updated?: string } => entry !== null);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ path, updated }) => `  <url><loc>${base}${path}</loc>${updated ? `<lastmod>${updated.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
