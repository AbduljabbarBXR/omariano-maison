# Omariano Maison

A static, multi-page storefront for **Omariano Bookstore**, South C, Nairobi. Built as a client-facing design preview of the “Omariano Maison” concept: a warm, editorial house of books using the bookstore’s real catalogue and cover images.

**Live preview:** <https://omariano-maison.netlify.app>

**Source:** <https://github.com/AbduljabbarBXR/omariano-maison>

## What is here

- `index.html` — editorial homepage with hero, collections, The Omariano Edit, house pick, new arrivals, children’s shelf and visit details.
- `shop.html` — full catalogue with collection, price, availability and offer filters, search, sorting and load-more.
- `about.html` — the story of the house.
- `contact.html` — visit details, contact form, FAQ and directions.
- `404.html` — branded fallback page.
- `data/products.json` — 288 published products from the September 2026 store backup.
- `data/site.json` — collection counts, curated selections and house details.
- `assets/covers/` — optimised WebP cover images for every product.

## Run locally

The catalogue is loaded with `fetch`, so the site needs a local web server rather than opening the HTML files directly:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Catalogue data

The product data and images were extracted from:

`backup_9.20.2026_06_57_28_omariano.tar.gz`

Only published products with a valid cover image were included. Prices, stock levels, titles, authors, descriptions and collection assignments come from the backup database. The build script that normalises the data and prepares the images is `scripts/build_data.py`.

All DB discounts were fixed-amount and expired at the time of extraction, but the live site still displays them. The static build applies those discounts as the displayed sale price.

## What is real and what is placeholder

**Real:** catalogue, covers, categories, stock status, prices, phone number, email, address, social links, WhatsApp ordering.

**Placeholder / preview copy:** the “Maison” editorial voice, collection blurbs, curated selection, opening hours, the free-delivery-over-KES-5,000 promise, payment wording, FAQ answers and the newsletter/contact forms. These should be confirmed with the Omariano team before the site replaces the live store.

The contact and newsletter forms are front-end only. The contact form opens the visitor’s email app with a pre-filled message to `info@omariano.com`; orders are completed over WhatsApp or by phone. There is no server-side checkout.

Product cover images retain the faint “OMARIANO BOOKSTORE” watermark from the source catalogue.

## Deployment

The site is plain static HTML/CSS/JS and can be hosted anywhere.

### Netlify

A zip deploy can be published with the Netlify API, or through the CLI:

```bash
npx netlify-cli deploy --prod --dir .
```

`netlify.toml` sets the publish directory to the repository root and adds long-lived caching for cover images.

### GitHub Pages

Push the repository to GitHub and enable Pages with **Source: Deploy from a branch**, branch `main`, folder `/ (root)`. The included `.nojekyll` file keeps the site’s folders intact.

## Notes for the next iteration

- Replace placeholder policies and delivery wording with the bookstore’s confirmed terms.
- Confirm opening hours and whether Sunday trading applies.
- Decide whether to keep the `noindex` robots meta while this is a private client preview.
- If a real checkout is needed later, connect the catalogue to the live Active eCommerce backend instead of maintaining a static snapshot.
