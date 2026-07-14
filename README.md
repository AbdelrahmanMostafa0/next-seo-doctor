# next-seo-doctor

SEO breaks silently — no error, no console warning, just quietly worse results months later. A missing canonical, a stamped build timestamp on every sitemap entry, a dangling JSON-LD reference — none of it fails your build, and none of it shows up until traffic already dropped. `next-seo-doctor` crawls your built Next.js site the way a search engine would and tells you before you ship.

## Install & usage

```sh
next build && next start
npx next-seo-doctor http://localhost:3000
```

That's it — no config file, one positional argument. Exit code is `0` when clean and `1` when it finds SEO errors, so it works as a CI gate for free.

### Localhost runs

Your sitemap, robots.txt, and og:image URLs usually carry the production origin (from `metadataBase`) even when the site runs locally. When the URL you pass is localhost (any port — also `127.0.0.1`, `0.0.0.0`, `*.localhost`), the crawler swaps that production origin for your local one and tests the same paths against the local server — it never silently audits the deployed site, and it works before you've deployed at all. The swap is reported as an info finding; URLs on unrelated origins (CDNs, external hosts) are fetched as-is.

Canonicals on a single production origin are expected on localhost: as long as each page's canonical path self-references, the pages count as ok and the origin is reported once as an info line (mixed origins or wrong paths still warn). Full canonical validation runs when you point the tool at the production URL.

```sh
next-seo-doctor <url> [options]
```

## Options

| flag | default | description |
| --- | --- | --- |
| `--max-pages <n>` | `200` | max pages to crawl |
| `--concurrency <n>` | `5` | concurrent page fetches |
| `--filter <prefix>` | — | only crawl sitemap URLs whose pathname starts with this prefix (e.g. `--filter /blog`) |
| `--only <ids>` | — | comma-separated check IDs; run only these (mutually exclusive with `--skip`) |
| `--skip <ids>` | — | comma-separated check IDs; run all except these (mutually exclusive with `--only`) |
| `--json` | off | machine-readable output instead of the colored report |
| `--version` | — | print version and exit |
| `--help` | — | print help and exit |

Valid check IDs for `--only`/`--skip`: `canonical`, `sitemap-honesty`, `jsonld-valid`, `jsonld-graph`, `jsonld-xss`, `robots-leak`, `og-image`, `duplicate-canonicals`.

## The 8 checks

| id | what it catches |
| --- | --- |
| `canonical` | missing, relative, or wrong-origin `<link rel="canonical">`; non-self-referencing canonicals |
| `sitemap-honesty` | sitemap `lastmod` values that are missing or all stamped with the same build timestamp |
| `jsonld-valid` | JSON-LD `<script>` blocks that fail to parse |
| `jsonld-graph` | dangling `@id` references between JSON-LD nodes ("schema confetti") |
| `jsonld-xss` | unescaped `<` in JSON-LD that could break out of the `<script>` tag |
| `robots-leak` | `robots.txt` `Disallow` entries that look like they're guarding something sensitive |
| `og-image` | missing `og:image`, broken image URLs, or images that aren't exactly 1200×630 |
| `duplicate-canonicals` | two different pages claiming the same canonical URL |

## Example output

```
next-seo-doctor v0.1.0 — crawled 42 pages from http://localhost:3000

✓ canonical            42/42 pages ok
✗ sitemap-honesty      38/42 lastmod values are identical (2026-07-11T09:14:22Z)
    → use real content dates (post.updated ?? post.date), not new Date() at build time
✓ jsonld-valid         61 blocks parsed
✗ jsonld-graph         2 dangling @id references
    → /blog/post-a: author {"@id": ".../#person"} — target never declared
    → /blog/post-b: author {"@id": ".../#person"} — target never declared
✓ jsonld-xss           all blocks escaped
⚠ robots-leak          Disallow: /admin/ — robots.txt is public; sensitive paths need auth
✓ og-image             41/42 ok
    ⚠ /about: og:image is 1024×512, expected 1200×630
✓ duplicate-canonicals no collisions

2 errors, 2 warnings — exit 1
```

## CI usage

Just run it — a non-zero exit fails the build.

```yaml
- run: npx next-seo-doctor http://localhost:3000
```

Exit codes: `0` clean, `1` SEO errors found, `2` the tool itself couldn't run (bad arguments, unreachable site, aborted crawl) — so CI can tell "your SEO is broken" apart from "the audit didn't run."

## License

MIT
