# Wise Maine Coon migration

Astro and Cloudflare Workers Static Assets rebuild of `wisemainecoon.com`.

The migration preserves the existing Blogger URL paths, including dated post
URLs and `/p/*.html` pages. The Worker normalizes requests to HTTPS, the `www`
hostname, and removes Blogger's `?m=1` parameter in a single permanent redirect.

## Local setup

```sh
npm install
npm run build
npm run verify
npm run preview
```

## Importing a newer Blogger export

Extract the Google Takeout archive, then run:

```sh
node scripts/import-blogger.mjs /absolute/path/to/feed.atom
npm run build
npm run verify
```

Review the generated pages before deployment.

## Publishing a new article

Keep drafts under `src/pages/preview/` with `preview={true}`. A preview is
`noindex` and is omitted from the sitemap and homepage lists.

To publish, create the final route under `src/pages/` and export a `listing`
object from its Astro frontmatter with `title`, `path`, `description`,
`published` (ISO date), and `topic` (`feeding`, `growth`, `care`, or `litter`).
The homepage uses this metadata for the latest articles and topic groups. The
sitemap discovers the published page automatically. Add a contextual link from
its parent guide and a link back to that guide. Review its self-canonical,
public byline, image rights and descriptive alt text, then run `npm run build`
and `npm run verify` before deploying. Avoid changing the published date on an
ordinary edit; use `updated` in the listing for a significant revision.

## Cloudflare deployment

The project is configured in `wrangler.jsonc` for Cloudflare Workers Static
Assets. Create a Git-connected Worker using:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Test the generated `workers.dev` preview before attaching the production domain.
Do not change DNS until every canonical URL returns the expected page.
