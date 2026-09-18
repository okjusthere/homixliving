# Share center listing search

The listing tab supports free-text address, city, ZIP and MLS searches, plus an
exact city filter, property type, minimum/maximum USD price, minimum bedrooms,
and sorting. Applied filters stay active when switching between Homix and all
OneKey listings. Changing the search, filters, source or language resets the
results to page one. Mobile users open the Filters panel to edit conditions.

Listing cards show the MLS asking price, labeled “List price”, with a localized “Price on request”
fallback for missing prices. The open-house collection is not an individual
property and has no price. It appears only on the first unfiltered Homix page.
Sold listings also use their asking price so the displayed amount matches BBO's
price filtering and sorting. A missing asking price on a sold listing stays
unknown; its closing price is not substituted.

## Coordinated release

This feature spans two repositories:

- **homix-website**: `/api/share-catalog`, `src/lib/share-catalog.ts`, the new
  `src/lib/share-listing-filters.ts`, and the listing provider's opt-out from
  status-first ordering for share searches.
- **homixliving**: `/api/share/catalog`, the Homix Web client, the shared filter
  parser and the ShareCenter UI.

Deploy **homix-website first**, then **homixliving**. The website changes are
additive and compatible with older Portal clients. An old website deployment
does not return prices or apply the new filter parameters.

## API contract

Listing requests use `city`, `propertyType`, `minPrice`, `maxPrice`, `beds`, and
`sort` alongside the existing `q`, `listingScope`, `page` and `locale` parameters.
Price bounds are inclusive nonnegative USD amounts. `beds` is a minimum. Sorts
are `newest`, `price-asc`, `price-desc`, and `beds-desc`. Filters are applied by
the existing MLS provider before pagination, for both listing sources.

Invalid values or an inverted price range return HTTP 400. Listing conditions
are ignored for other content categories. Provider failures return HTTP 502,
rather than being displayed as an empty successful search.

## Validation

Run in Portal:

```sh
npm run test:share-catalog
npm run test:share-url
npx tsc --noEmit --incremental false
```

The catalog tests mock outbound HTTP and exercise the actual Portal route,
including authentication, filter forwarding, price data, invalid ranges,
curated-card eligibility and provider failures.

Run `node --test tests/share-catalog.test.mjs` and
`npx tsc --noEmit --incremental false` in the website repository. Its tests cover
filter validation, provider parameter mapping, price data, pagination and
preservation of the public website's default ordering.

33 browser checks passed using the actual components and CSS with simulated
API responses. They cover desktop and 375/390px mobile layouts in Chinese and
English, applying/resetting filters, source changes, pagination resets,
category isolation, empty states and stale response cancellation. Live MLS
integration still needs a smoke check after the coordinated deployment.
