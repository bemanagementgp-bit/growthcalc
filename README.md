# GrowthCalc – Compound Interest Calculator

Free, static compound interest calculator. Pure HTML/CSS/JS – no build step, no dependencies. Deployed as-is to Vercel.

**Live URL:** https://__SITE_URL__/ (placeholder – replaced after first deploy)

## Features

Free
- Initial investment, monthly contribution (start/end of month), annual contribution increase
- Annual rate with daily / monthly / quarterly / annual compounding (exact per-period math, simulated month by month)
- 1–50 years (slider + number), 8 currencies via `Intl.NumberFormat`
- Optional inflation toggle → "in today's money" values
- Big final balance, total contributions, total interest, interest %, doubling time (rule of 72 + exact)
- Hand-built inline SVG stacked bar chart (contributions vs interest) with hover tooltip
- Yearly and monthly breakdown tables
- Copy summary, share link (inputs in URL), reset, localStorage persistence
- SEO content + FAQ with JSON-LD `WebApplication` and `FAQPage`

Pro (gated with `isPro()`, one-time licence)
- Compare up to 3 saved scenarios (free: 1) – comparison table + overlay lines on the chart
- Goal calculator: "reach X in Y years – what monthly contribution?" (bisection solver)
- CSV export of the yearly/monthly table
- Printable PDF report (print stylesheet + `window.print()`)

## Local run

```bash
npx serve .
```

Then open the printed URL (e.g. http://localhost:3000). `cleanUrls` means `/privacy` and `/terms` work without `.html` on Vercel; `serve` handles that too.

## Monetization setup

All switches live in `config.js`:

1. **AdSense** – set `ADSENSE_CLIENT` to your `ca-pub-…` id. Ad slots (`.ad-slot[data-slot]`) render real units; until then they show a dashed placeholder. Add the slot ids in AdSense if you use manual units.
2. **Pro checkout** – create a product on Lemon Squeezy / Gumroad / Stripe Payment Links and paste the URL into `PRO_CHECKOUT_URL`. Set `PRO_PRICE` to match. Buyers paste the licence key from their receipt into the Pro modal (`activateLicense` in `monetize.js` is a simple length check – wire it to your provider's licence API before going live).
3. **Google Analytics** – set `GA_ID` (`G-XXXXXXX`). Events tracked: `copy`, `share`, `download` (csv/print), `scenario_save`, `goal_solve`, `pro_click`, `begin_checkout`, `affiliate_click`.
4. **Affiliate brokers** – fill `AFFILIATE_LINKS.broker1 / broker2` with `{ name, url }`. Partner cards render below the tool only when `url` is non-empty; the whole section stays hidden otherwise. Links use `rel="sponsored noopener"`.

After the first deploy, replace the `__SITE_URL__` placeholder in `index.html`, `privacy.html`, `terms.html`, `robots.txt`, `sitemap.xml` and `config.js` with the real domain (e.g. `sed -i 's/__SITE_URL__/growthcalc.app/g' *.html *.txt *.xml *.js`).

## Files

```
index.html      main tool page (SEO-complete)
styles.css      shared base.css + app styles (incl. print report)
app.js          calculator logic, chart, tables, scenarios, goal solver, export
monetize.js     shared theme / toast / GA / AdSense / Pro helpers (do not edit per app)
config.js       window.APP_CONFIG
privacy.html    privacy policy (AdSense requirement)
terms.html      terms of use
robots.txt, sitemap.xml, vercel.json, favicon.svg
```

## Math

Effective monthly rate `rm = (1 + r/n)^(n/12) − 1` where `n` is periods per year (365/12/4/1). Each month: interest = balance × rm; the monthly contribution is added before (start) or after (end) interest. Contribution grows by the annual increase at each new year. Inflation-adjusted value = balance ÷ (1 + i)^years.

Disclaimer: educational tool, not financial advice.
