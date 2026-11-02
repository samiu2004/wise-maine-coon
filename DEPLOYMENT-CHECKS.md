# Deployment checks

Before preparing a bundle or pushing a release:

1. Run `npm run build` and `npm run verify`.
2. Run `python scripts/check-external-links.py` against the current build. The JSON report is written to `/tmp/wise-maine-coon-external-links.json`.
3. Review every non-success result. A 401/403, challenge page or timeout is unresolved, never a pass. Replace an inaccessible research link only with a verified copy of the same source. Preserve photo attribution and its provenance when changing credit links.
4. Check changed interactive features in a browser when available. Report explicitly when this is unavailable.
5. Treat a successful automated request as reachability from the checker, not a guarantee for all visitors. If a visitor reports an access block, do not dismiss it because an automated check passed.
6. State remaining limitations before deployment. Do not describe a release as fully verified when checks are inconclusive.
