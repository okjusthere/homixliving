/**
 * Minimal brand/contact config for the marketing-style pages ported into the
 * portal (e.g. the gated /offer page). The full public-site config lives in the
 * homixweb repo; only what these pages reference is mirrored here.
 */
export const siteConfig = {
  url: "https://www.homixny.com",
  contact: {
    phone: "(929) 666-9886",
    phoneHref: "tel:+19296669886",
    phone2: "(516) 988-8558",
    phone2Href: "tel:+15169888558",
    email: "homix@homixny.com",
  },
} as const;
