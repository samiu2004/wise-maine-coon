import pins from "@/data/pinterest-pins.json";

export const prerender = true;

const site = "https://www.wisemainecoon.com";
const feedPath = "/pinterest-feed.xml";
const escapeXml = (text: string) => text.replace(/[<>&"']/g, character => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;"
})[character]!);

export function GET() {
  // Deliberate whitelist: publishing an article never automatically adds a Pin.
  const approved = pins.filter(pin => pin.approved);
  const ids = new Set<string>();
  for (const pin of approved) {
    if (!pin.id || ids.has(pin.id)) throw new Error("Pinterest Pin IDs must be unique and stable.");
    ids.add(pin.id);
    if (!pin.title.trim() || !pin.description.trim() || !Number.isFinite(Date.parse(pin.published))) {
      throw new Error(`Incomplete Pinterest entry: ${pin.id}`);
    }
    const article = new URL(pin.articlePath, site);
    const image = new URL(pin.imagePath, site);
    if (article.origin !== site || image.origin !== site || !image.pathname.endsWith(".jpg")) {
      throw new Error(`Pinterest entry must use this site's article and JPEG asset: ${pin.id}`);
    }
  }
  const items = approved.map(pin => `    <item>
      <guid isPermaLink="false">${escapeXml(`wise-maine-coon:pinterest:${pin.id}`)}</guid>
      <title>${escapeXml(pin.title)}</title>
      <description>${escapeXml(pin.description)}</description>
      <link>${escapeXml(new URL(pin.articlePath, site).href)}</link>
      <pubDate>${new Date(pin.published).toUTCString()}</pubDate>
      <media:content url="${escapeXml(new URL(pin.imagePath, site).href)}" type="image/jpeg" medium="image" width="1000" height="1500" />
    </item>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Wise Maine Coon: approved Pinterest Pins</title>
    <link>${site}/</link>
    <description>Editorially approved Pinterest artwork and copy from Wise Maine Coon.</description>
    <language>en-US</language>
    <atom:link href="${site}${feedPath}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
