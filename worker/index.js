const canonicalHost = "www.wisemainecoon.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPreviewHost = url.hostname.endsWith(".workers.dev") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1";
    const needsCanonicalHost = !isPreviewHost && url.hostname !== canonicalHost;
    const needsHttps = !isPreviewHost && url.protocol !== "https:";
    const hasMobileParameter = url.searchParams.has("m");

    if (needsCanonicalHost || needsHttps || hasMobileParameter) {
      if (!isPreviewHost) {
        url.protocol = "https:";
        url.hostname = canonicalHost;
        url.port = "";
      }
      url.searchParams.delete("m");
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  }
};
