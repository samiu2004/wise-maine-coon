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

## Cloudflare deployment

The project is configured in `wrangler.jsonc` for Cloudflare Workers Static
Assets. Create a Git-connected Worker using:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Test the generated `workers.dev` preview before attaching the production domain.
Do not change DNS until every canonical URL returns the expected page.
