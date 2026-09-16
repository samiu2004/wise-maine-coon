const canonicalHost = "www.wisemainecoon.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const needsCanonicalHost = url.hostname !== canonicalHost;
    const needsHttps = url.protocol !== "https:";
    const hasMobileParameter = url.searchParams.has("m");

    if (needsCanonicalHost || needsHttps || hasMobileParameter) {
      url.protocol = "https:";
      url.hostname = canonicalHost;
      url.port = "";
      url.searchParams.delete("m");
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  }
};
