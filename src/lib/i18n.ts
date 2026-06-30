import { cookies } from "next/headers";

/**
 * Lightweight bilingual (English / 中文) layer.
 *
 * Locale is read from a `locale` cookie on the server, so pages render fully in
 * the chosen language (good for both audiences). A header toggle sets the cookie.
 * NOTE: cookie-based locale makes pages dynamic; for per-language SEO indexing,
 * migrate to `/en` `/zh` path routing later. Listing/agent DATA stays as-is
 * (MLS is English); only brand/marketing copy is translated.
 */

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return store.get("locale")?.value === "zh" ? "zh" : "en";
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: messages[locale] };
}

const brokerageFormsSheetUrl =
  "https://docs.google.com/spreadsheets/d/1O_-CECoofUNZu3Zfjw7Ey6gn6yL7wbNhBXyXksRQx4c/edit?gid=0#gid=0";

const brokerageFormGroups = [
  {
    title: "Buyer side / Selling Agent",
    description: "Forms commonly used when representing a buyer.",
    forms: [
      {
        name: "Selling Agent Package",
        blankLink:
          "https://drive.google.com/file/d/1Gb-OyFWSwfo2KoGTaWeRefbfhyQLHgYG/view?usp=share_link",
        sampleLink:
          "https://drive.google.com/file/d/1Gx7-6w-xX98WAoQOxRSaBhfbin8l5eG9/view?usp=drive_link",
      },
      {
        name: "Binder",
        blankLink:
          "https://drive.google.com/file/d/1CksGiUnkRwGVcpjVg6WiLTebjEKosxAn/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1MIUpZVnN-_XwQfGExbR_eCgPeXxSBTRe/view?usp=drive_link",
      },
      {
        name: "Exclusive Buyer Representation Agreement",
        blankLink:
          "https://drive.google.com/file/d/15Tq18WOxvhc_4vMBCNbK0yfBvtU0ItXP/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1MIUpZVnN-_XwQfGExbR_eCgPeXxSBTRe/view?usp=drive_link",
      },
      {
        name: "Non-Exclusive Buyer Representation Agreement",
        blankLink:
          "https://drive.google.com/file/d/1zVb0shEvDH4RnDBlrfUQKFZAlS5wpNCQ/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1kPijXNbFPcfaQU8FA2P1rnUuZK5G_moJ/view?usp=drive_link",
      },
      {
        name: "Memorandum of Offer to Purchase/Sell",
        blankLink:
          "https://drive.google.com/file/d/1eFzb6GOHtqYuMfPtdZDxKs_q3vJEiaZd/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1H-J5tGn1hhC1bTilj725rimhF7x2PXCQ/view?usp=drive_link",
      },
      {
        name: "Agency Disclosure",
        blankLink:
          "https://drive.google.com/file/d/1P31r8xqNeBhUMwiKDMTzCLACUnzAdaW_/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1HNxLkh8e4zxRk3-GfGdZ1lp6O_1RW_2t/view?usp=drive_link",
      },
      {
        name: "Lead Paint Disclosure",
        blankLink:
          "https://drive.google.com/file/d/1TrKEITGPG4HaAE_uGfRhpfihDK_PljzJ/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1tf4UzrKEUkxk97VevcLV7oGCRb7s_lev/view?usp=drive_link",
      },
      {
        name: "Fair Housing Discrimination Disclosure",
        blankLink:
          "https://drive.google.com/file/d/1eOM22cT3wzDSdI1kDAwIOI7-9CGyF7iJ/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1SJ5ibvDl1rFPt-kBs8W2ucQBOPpOzHQi/view?usp=drive_link",
      },
      {
        name: "Deal Sheet",
        blankLink:
          "https://drive.google.com/file/d/1ln3Lr0mT7bQdWaUQF2o5qcBCo-OSUtHo/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1xDuJk9qyG7LhWiz6HYS8xsiP_bw9bqzE/view?usp=drive_link",
      },
      {
        name: "Confirmation of Seller's Agreement to Pay Buyer Broker",
        blankLink:
          "https://drive.google.com/file/d/1OX7fhR6m4kZc645UFHWk3HJkk-N9ek7U/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1LT0UubPkVBXyYP0FkINlqPDrfQP1mkb2/view?usp=drive_link",
      },
      {
        name: "Buyer Commission Agreement",
        blankLink:
          "https://drive.google.com/file/d/1sEopgpGI-qEoMKxsxUJr2GsHIG-M8cHC/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/19wUqJmWn3unxiGDEtTUznTC45KWWksH6/view?usp=drive_link",
      },
      {
        name: "Buyer Agreement Shown Properties",
        blankLink:
          "https://drive.google.com/file/d/1Z9vXqDcCyKxSoCzmbJ0TwxH1CR35zxHY/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1Hcm3uxEqj1goUjgrsyaHPapgENcKShyo/view?usp=drive_link",
      },
      {
        name: "Commission Report",
        blankLink:
          "https://drive.google.com/file/d/1lz9W43zT-lx6Y44-td73ok7QIdfQobG0/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Seller side / Listing Agent",
    description: "Residential listing, disclosure, MLS, and seller-side transaction forms.",
    forms: [
      {
        name: "Residential Listing Package",
        blankLink:
          "https://drive.google.com/file/d/1ubJDoYJ27_SC_QP-hGfo2yc2eVQz2ctO/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1-B6mtw_oc1GS8sfu1W9c_vOIGxdPo0_3/view?usp=drive_link",
      },
      {
        name: "Condo / Coop Listing Package",
        blankLink:
          "https://drive.google.com/file/d/1ZVNgbzIzAs10YpuV__gMyqEW9VJinxYz/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1E4LhXbdiAvIshpy0vCgwtBzjeLajrSpM/view?usp=drive_link",
      },
      {
        name: "Confirmation of Seller's Agreement to Pay Buyer Broker",
        blankLink:
          "https://drive.google.com/file/d/1OX7fhR6m4kZc645UFHWk3HJkk-N9ek7U/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1HRkxf7qVtPcat1rCALsJzE604kOnUJDE/view?usp=drive_link",
      },
      {
        name: "Agency Disclosure",
        blankLink:
          "https://drive.google.com/file/d/1P31r8xqNeBhUMwiKDMTzCLACUnzAdaW_/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1HNxLkh8e4zxRk3-GfGdZ1lp6O_1RW_2t/view?usp=drive_link",
      },
      {
        name: "Lead Paint Disclosure",
        blankLink:
          "https://drive.google.com/file/d/1TrKEITGPG4HaAE_uGfRhpfihDK_PljzJ/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1tf4UzrKEUkxk97VevcLV7oGCRb7s_lev/view?usp=drive_link",
      },
      {
        name: "Fair Housing Discrimination Disclosure",
        blankLink:
          "https://drive.google.com/file/d/1eOM22cT3wzDSdI1kDAwIOI7-9CGyF7iJ/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1SJ5ibvDl1rFPt-kBs8W2ucQBOPpOzHQi/view?usp=drive_link",
      },
      {
        name: "Offer Presentation and Negotiation Authorization Form",
        blankLink:
          "https://drive.google.com/file/d/1GDXfoBP9gHDklNRYHoBN47U5FLUH8VU2/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/11x-UJxCN10A6S2qoeCFfJ2oX8tq5xPU7/view?usp=drive_link",
      },
      {
        name: "Deal Sheet",
        blankLink:
          "https://drive.google.com/file/d/1ln3Lr0mT7bQdWaUQF2o5qcBCo-OSUtHo/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1xDuJk9qyG7LhWiz6HYS8xsiP_bw9bqzE/view?usp=drive_link",
      },
      {
        name: "Property Condition Disclosure Statement (PCDS)",
        blankLink:
          "https://drive.google.com/file/d/1N3zL9VWh9ec483JYFKx41OadIaaotB5U/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1q-MvkN7gYFZdzQf09L0DMVucrjMUrBIS/view?usp=drive_link",
      },
      {
        name: "Office Exclusive Seller Disclosure (Private listing only)",
        blankLink:
          "https://drive.google.com/file/d/14QCxZukq7k_Nj67brNIyL1U6p7QCG8Fs/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1MqpXqKN7crAHHCE1qN-qFBQ1sEBhTutU/view?usp=drive_link",
      },
      {
        name: "Extension Agreement",
        blankLink:
          "https://drive.google.com/file/d/1uzFvcbX6zx3tMfyLa2lbty7LMh2r5rns/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1CnO4a_CwJ8JJDXOS4UBlKdCB7C0mSW0O/view?usp=drive_link",
      },
      {
        name: "Coming Soon Authorization Form",
        blankLink:
          "https://drive.google.com/file/d/1ZedytkrgqjMLXYfYu-Hunqrk7lSSyikP/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/160JigRJ80ULnBQWYnEVoo5AxL59MMTc_/view?usp=drive_link",
      },
      {
        name: "Required Fields for MLS Listing Property Data Section",
        blankLink:
          "https://drive.google.com/file/d/1B0MPihrtXfmzk2msGg6LMjm7Ws07NSGd/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1QSNntxWy62IBkQ1DOlR9eGKsZkCIBvvT/view?usp=drive_link",
      },
      {
        name: "Commission Report",
        blankLink:
          "https://drive.google.com/file/d/1lz9W43zT-lx6Y44-td73ok7QIdfQobG0/view?usp=drive_link",
      },
      {
        name: "Brokerage Commission Agreement",
        blankLink:
          "https://drive.google.com/file/d/1RVRrj3HBplivabrW2cPvPNOxDm2YrFXe/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Co-Broker / Collaboration",
    description: "Referral, collaboration, open house, and off-market cooperation paperwork.",
    forms: [
      {
        name: "General Agent Collaboration Agreement",
        blankLink:
          "https://drive.google.com/file/d/1rEDd5XDTy9OhuV56014VxZZkMolujb7D/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1UoW_Lg2oJNuAGaY43Tvaj6SkUS7vbLrs/view?usp=drive_link",
      },
      {
        name: "Referral Form",
        blankLink:
          "https://drive.google.com/file/d/1Rxe8StB_gD5loIn_VL4Y1Lb20BRKd-Kj/view?usp=drive_link",
      },
      {
        name: "Seller Referral Form",
        blankLink:
          "https://drive.google.com/file/d/1-7BCPEoKTpeUsUcGP2jhETA3p2sM-3nO/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1e8jugzlbO3CV26L4W_mdqYFjJNiybsdG/view?usp=drive_link",
      },
      {
        name: "Open House Agent Collaboration Agreement",
        blankLink:
          "https://drive.google.com/file/d/1or2ef0hDxC17NO4Tlfge19bkfTZpFcqr/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1W2cfpvYnD9716lXM80mo4Men5jJuxGTP/view?usp=drive_link",
      },
      {
        name: "Co-broke Agreement (Off-market listing only)",
        blankLink:
          "https://drive.google.com/file/d/1OEJZqk9rqbf4ZkdOLvsnfWG2bT_bm10y/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1BILPEYJwlSA1xnf0wSVAGQxkW-VFB8J_/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Commercial",
    description: "Commercial listing, lease, sale, NDA, and worksheet forms.",
    forms: [
      {
        name: "LOI",
        blankLink:
          "https://drive.google.com/file/d/1azL0ru809rkoecHzUtIuuQoJcmYIigrl/view?usp=sharing",
      },
      {
        name: "Commercial Data Section",
        blankLink:
          "https://drive.google.com/file/d/1gt4BDW1l4QXFZmEzrCpc1Wa-5IsM36tv/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1qVHdebw70rIDa8KS-WKsNnVYuLFA-Fen/view?usp=drive_link",
      },
      {
        name: "NDA",
        blankLink:
          "https://drive.google.com/file/d/1FHJKpKYC2Wcw407zaJojkV1EdXR0m8Jg/view?usp=drive_link",
      },
      {
        name: "Business For Sale Worksheet",
        blankLink:
          "https://drive.google.com/file/d/1tJEcHLQMxakHdNzcidzKXo038_7hXQsN/view?usp=drive_link",
      },
      {
        name: "Land Form",
        blankLink:
          "https://drive.google.com/file/d/1aZ6pi2Ix5ggdzpe206N9TGpWGfrgcTsh/view?usp=drive_link",
      },
      {
        name: "Commercial (Sale) Listing Package",
        blankLink:
          "https://drive.google.com/file/d/1gt4BDW1l4QXFZmEzrCpc1Wa-5IsM36tv/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1gp9ztVz2JC_iaoipN_737p0PCbTSueSk/view?usp=drive_link",
      },
      {
        name: "Commercial (Lease) Listing Package",
        blankLink:
          "https://drive.google.com/file/d/1yIROUENqJeSPeUJTGTf_SmQAq27tu8Ug/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1aagb5HpzCa8ADsLrwA_Cris8jH5Uj9YJ/view?usp=drive_link",
      },
      {
        name: "Commercial Offer",
        blankLink:
          "https://drive.google.com/file/d/1irZMZk7eGlDGkfbDafH-wgKMm8CfoJYJ/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Rental",
    description: "Rental listing, agency, lead paint, commission, and tenant application forms.",
    forms: [
      {
        name: "Rental Listing Package",
        blankLink:
          "https://drive.google.com/file/d/158Teb9XRcc5jQy-mN-u89aCkBbxBwQR5/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1v9NYBhr_X8-vkjQtrmqsItmi5THRWb0m/view?usp=drive_link",
      },
      {
        name: "Agency Disclosure (Landlord/Tenant)",
        blankLink:
          "https://drive.google.com/file/d/1eJJKY3m6QBZDzdpJ2oke71Smf9AyWrUZ/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/10GFwI6PzVSw4CAhHVBwRHWld1Nz30gHt/view?usp=drive_link",
      },
      {
        name: "Lead Paint Disclosure (Landlord/Tenant)",
        blankLink:
          "https://drive.google.com/file/d/1OBbRZLjp-lDZxezOjp2w0mUn7_J3_806/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1Z3b8QeB6CzCfWjQc61bRjRxPDNBmLLsq/view?usp=drive_link",
      },
      {
        name: "Tenants Pay Rental Commission Agreement",
        blankLink:
          "https://drive.google.com/file/d/1ieQMZLYK9ZSB2BWz_7v8z6KzYdRYe-eo/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1VsZQ8vcANgrtr3GPRrS4Xp45tr202SOE/view?usp=drive_link",
      },
      {
        name: "Landlord Pay Rental Commission Agreement",
        blankLink:
          "https://drive.google.com/file/d/1JMnH4GYaGRB9EdQ7xUCASluDzZWiGdhD/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1NFSPcNAfTrFsbonXqtlMPo4eu3t5Jce2/view?usp=drive_link",
      },
      {
        name: "Tenant Application Form",
        blankLink:
          "https://drive.google.com/file/d/14EUve6ZKj5c4l2SqNy7yDwgQST8ptL-O/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Open House",
    description: "Open house registration and package forms.",
    forms: [
      {
        name: "Open House Registration",
        blankLink:
          "https://drive.google.com/file/d/1-IdSkPJnnD7k6G4qpuCv3BPzW5q3_pBa/view?usp=drive_link",
      },
      {
        name: "Open House Package",
        blankLink:
          "https://drive.google.com/file/d/1n2zDp2lrTtzZGsTu-GhUi5b4SKJd-FZQ/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Other",
    description: "Accounting, status change, withdrawal, net sheet, and Manhattan-specific forms.",
    forms: [
      {
        name: "Brokerage Bill / Commission Invoice",
        blankLink:
          "https://drive.google.com/file/d/1lUNC6XxQOfF7ffTJAslZAZhN-JyDDC-F/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/13mckhM-IhsJF33BX0xURvvbRsLwKIizM/view?usp=drive_link",
      },
      {
        name: "Status Change",
        blankLink:
          "https://drive.google.com/file/d/1i8x3StbI7JT9CC9YyC2NXQl3qu1ZMdQW/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1V7puD72ifyKUoJ5Fffr1SVRl6UOv4nnr/view?usp=drive_link",
      },
      {
        name: "Withdrawal Form",
        blankLink:
          "https://drive.google.com/file/d/1Lf9gqfU-jFH8FYRD3fLkHRCksKebhv7T/view?usp=drive_link",
        sampleLink:
          "https://drive.google.com/file/d/1WYBvIEixcpXvw36O0SrDqlJbEHHWgBQf/view?usp=drive_link",
      },
      {
        name: "Listing",
        blankLink:
          "https://drive.google.com/file/d/15h_AIaLLaHbwWOk2dfKMjzcmouvdpIDc/view?usp=drive_link",
      },
      {
        name: "Net Sheet",
        blankLink:
          "https://drive.google.com/file/d/1D1MCT1uJnsy8kjHgakX85d9CCnUpzxCC/view?usp=drive_link",
      },
      {
        name: "Manhattan-Rental Listing Agreement",
        blankLink:
          "https://drive.google.com/file/d/1HW4q3DAxyzMop20LNBQif6N6S7hjJyR_/view?usp=drive_link",
      },
      {
        name: "Manhattan-Condo Listing Agreement",
        blankLink:
          "https://drive.google.com/file/d/1jWsjxBU6B62_FgI3dVWx8tj7StChtNti/view?usp=drive_link",
      },
    ],
  },
  {
    title: "Homix Living",
    description: "Homix Living forms from the shared operations sheet.",
    forms: [
      {
        name: "Agent Enrolls Package",
        blankLink:
          "https://drive.google.com/file/d/1Cl8inXd6JFTtBf7c_2aM3U-cT5yuQ45t/view?usp=drive_link",
      },
      {
        name: "Manhattan-Condo List Agreement",
        blankLink:
          "https://drive.google.com/file/d/1fZqoMDDNlPLGl2pf_jtmKOI2pbLMIUgx/view?usp=drive_link",
      },
      {
        name: "Manhattan-Rental Listing Agreement",
        blankLink:
          "https://drive.google.com/file/d/1PlNunVcCUibkiOm7bX1hsSRdt7r-iECQ/view?usp=drive_link",
      },
    ],
  },
];

const brokerageSubmissionGroups = [
  {
    title: "New Listing (Residential)",
    items: [
      "Listing Agreement",
      "Agency Disclosure",
      "Lead Paint Disclosure",
      "Fair Housing Disclosure",
    ],
  },
  {
    title: "Pending / Under Contract",
    items: [
      "Contract",
      "Agency Disclosure signed by buyer",
      "Lead Paint signed by seller and buyer",
      "Lead Paint Booklet for buyer to keep",
      "Property Disclosure Statement",
      "Fair Housing Disclosure signed by buyer",
      "Deal Sheet / control card to office",
    ],
  },
  {
    title: "Closing",
    items: ["Commission Check", "Commission Report"],
  },
  {
    title: "New Listing (Rental)",
    items: [
      "Listing Data Section",
      "Listing Agreement Contract Page",
      "Agency Disclosure",
      "Lead Paint Disclosure",
      "Fair Housing Disclosure",
    ],
  },
  {
    title: "Rented / Leased",
    items: [
      "Signed Lease",
      "Agency Disclosure for Rental signed by tenant",
      "Lead Paint Disclosure for Rental signed by tenant",
      "Lead Paint Booklet for tenant",
      "Fair Housing Disclosure signed by tenant",
      "Copy of Rental Check",
      "Commission Check",
      "Commission Report",
    ],
  },
];

const en = {
  common: {
    listings: "Buy",
    advisors: "Advisors",
    journal: "Journal",
    sell: "Sell",
    join: "Join Homix",
    about: "About",
    contact: "Contact",
    neighborhoods: "Neighborhoods",
    offer: "Make an offer",
    buyercoach: "Buyer coach",
    tools: "Agents Portal",
    onboarding: "Onboarding",
    training: "Training",
    privacy: "Privacy",
    terms: "Terms",
    accessibility: "Accessibility",
    fairHousing: "Fair Housing",
    standardOperatingProcedures: "Standard Operating Procedures",
    explore: "Explore",
    firm: "Firm",
    legal: "Legal",
    backHome: "Back home",
    viewProfile: "View profile",
    calculator: "Mortgage calculator",
    agentLogin: "Agent Login",
    langLabel: "中文",
  },
  footer: {
    eho: "Homix Realty Inc. is committed to the principles of the Fair Housing Act and the Equal Opportunity Act. We do not discriminate on the basis of race, color, religion, sex, disability, familial status, or national origin. All information is deemed reliable but not guaranteed.",
    brokerOfRecord: "Broker of Record",
    licensedIn: "Licensed in",
    rights: "All rights reserved.",
  },
  hero: {
    eyebrow: "New York Real Estate · Media · AI",
    title: "Where homes meet headlines.",
    lead: "New York's media-first real estate company. We sell homes, build star agents, and run the content machine — a 1,000,000+ audience and AI-driven marketing that traditional brokerages can't touch.",
    ctaPrimary: "View listings",
    ctaSecondary: "Meet the team",
  },
  brandStory: {
    eyebrow: "The firm",
    title: "Not another brokerage. A real estate media company.",
    p1: "Homix blends the essence of home and mix: brokerage, media studio, and agent incubator under one roof. Viral video, lifestyle content, and a 1M+ audience put every listing — and every agent — in front of the market.",
    p2: "The result is exposure most firms can only dream of, faster closings, and a bilingual team that knows Queens, Long Island, and Manhattan by heart — backed by the data and AI that make every move sharper.",
  },
  pillars: {
    eyebrow: "What we do",
    title: "Three ways to work with Homix",
    items: [
      {
        eyebrow: "Buy & Sell",
        title: "Find or sell a home",
        body: "Full-service representation across Queens, Long Island, and Manhattan — with marketing that puts most brokerages to shame.",
        cta: "Browse listings",
      },
      {
        eyebrow: "Careers",
        title: "Build your career",
        body: "Join the brokerage that hands you an audience. Media training, personal-brand building, leads, and AI tools — we turn agents into stars, not just hires.",
        cta: "Join Homix",
      },
      {
        eyebrow: "Media & Marketing",
        title: "Reach more buyers",
        body: "A content studio with a 1M+ following produces the video and runs the campaigns that put properties — and people — in front of the entire market.",
        cta: "Work with our studio",
      },
    ],
  },
  stats: {
    items: [
      { value: "1M+", label: "Social followers" },
      { value: "40+", label: "Advisors" },
      { value: "Top", label: "NY content brokerage" },
      { value: "中 / EN", label: "Bilingual service" },
    ],
  },
  valueProps: [
    {
      title: "Media is our marketplace",
      body: "We were built on a self-media platform — viral video, lifestyle content, and a 1M+ audience that puts every listing in front of the right buyers, fast.",
    },
    {
      title: "We make agents into stars",
      body: "Homix is an incubator. Agents get media training, personal-brand building, real leads, and the tools to build a business — not just a desk.",
    },
    {
      title: "AI and data, not guesswork",
      body: "Pricing, marketing, and client guidance are sharpened by data and AI — so every decision is faster and better informed than the competition's.",
    },
  ],
  featured: {
    eyebrow: "Selected listings",
    title: "Featured New York homes",
    viewAll: "View all listings",
  },
  neighborhoods: {
    eyebrow: "Local knowledge",
    title: "Neighborhoods we know by heart",
    lead: "Pricing and timing come from people who actually walk these streets. A few of the places we cover most closely.",
    exploreAll: "Explore all neighborhoods",
  },
  reach: {
    eyebrow: "Our reach",
    title: "We don't wait for the headlines. We make them.",
    lead: "Every listing rides a content engine with a 1,000,000+ audience across platforms — the marketing edge behind faster, higher sales.",
  },
  testimonials: { eyebrow: "In their words" },
  team: {
    eyebrow: "The advisors",
    title: "The people behind the work",
    lead: "A senior, bilingual team. You work directly with the advisor whose name is on the door — not a hand-off.",
    cta: "Meet the advisors",
  },
  contactBand: {
    eyebrow: "Get in touch",
    title: "Let's talk about your next move.",
    lead: "Buying, selling, or just thinking it through — start a quiet conversation. No pressure, no obligation.",
  },
  inquiry: {
    name: "Full name",
    phone: "Phone",
    email: "Email",
    message: "How can we help?",
    consent:
      "I agree to be contacted by Homix by phone, text, or email about my inquiry. Consent is not a condition of any service. Message and data rates may apply; reply STOP to opt out.",
    submit: "Send inquiry",
    thanksTitle: "Thank you.",
    thanksBody: "We've received your note and will be in touch shortly.",
  },
  about: {
    eyebrow: "About Homix",
    title: "A media-first, AI-empowered New York real estate company.",
    lead: "Homix is a New York real estate company built media-first: we earn attention before we ask for a listing. We pair a bilingual team across Flushing, Queens and Long Island with AI-assisted pricing and marketing — so your home reaches the right buyers, in the right language, on the platforms they already trust.",
    p1: "Homix started with a camera, not a \"for sale\" sign. Before there was a brokerage, there was an audience — neighbors who followed founder Si Zhang (\"Sunny\") for honest, in-language explanations of how New York real estate actually works: what a co-op board really wants, why one block trades at a premium over the next, how to read a Queens listing between the lines. That media-first habit is still the whole point. We believe the best way to earn a client is to be genuinely useful long before anyone is ready to buy or sell, and to keep showing up after the deal closes.",
    p2: "That origin shapes how we operate. Our team is bilingual by default — fluent in English and Mandarin, and fluent in the realities of Flushing, the rest of Queens and Long Island, where so many families are making their first or biggest American purchase. We use AI where it earns its place: pricing a home against fresh comparables, drafting marketing in two languages, matching the right buyer to the right home faster. The technology stays behind the scenes; the relationship stays in front. Whether you're buying your first apartment or listing the home you raised a family in, you get a team that already knows your neighborhood — and an audience that's already listening.",
    whatWeAreEyebrow: "What we are",
    whatWeAreTitle: "Three companies in one.",
    whatWeAre: [
      {
        title: "A brokerage",
        body: "A licensed New York residential brokerage. We list, market and close homes the way a brokerage should — fiduciary, full-service, fair-housing compliant — but with an audience already watching before your sign goes up.",
      },
      {
        title: "A media studio",
        body: "Content is how we work, not an afterthought. We shoot, edit and publish the neighborhood walk-throughs, market explainers and home tours that have built a real local following — so every listing launches into an audience instead of into silence.",
      },
      {
        title: "An agent incubator",
        body: "We help agents build a personal brand, not just a pipeline. New agents get our media playbook, AI tools and bilingual support from day one — the platform we wish we'd had — so their reputation compounds instead of resetting with every deal.",
      },
    ],
    howEyebrow: "How we work",
    workWithUs: "Work with us",
    meetTeam: "Meet the team",
    teamEyebrow: "Our team",
    teamTitle: "One team, every corner of New York.",
    teamBody: "From Flushing to Manhattan to the North Shore, our advisors share one standard of service — local knowledge, bilingual care, and a media engine behind every deal.",
  },
  join: {
    eyebrow: "Careers at Homix · Flushing · NYC · LI",
    title: "We don't hand you a desk. We hand you an audience.",
    lead: "Most brokerages sell you a logo and a commission split, then leave you to find clients alone. Homix is a brokerage, an agent incubator, and a media engine in one. Day one, you step into an audience of 1,000,000+ across 抖音, 小红书, and Instagram, an in-house content studio, AI and data tools, and bilingual senior mentors who have closed in this market. Where Homes Meet Headlines — we turn agents into local stars.",
    heroCta: "Apply to join Homix",
    stats: [
      {
        value: "1,000,000+",
        label: "Followers across 抖音 · 小红书 · Instagram you tap into on day one",
      },
      {
        value: "Bilingual",
        label: "English + 中文 team built for NYC's Chinese-American buyers and sellers",
      },
      {
        value: "In-house",
        label: "Content studio — shoot, edit, and publish without paying an outside agency",
      },
      {
        value: "Flushing · NYC · LI",
        label: "Rooted in the markets we actually live and sell in",
      },
    ],
    benefitsEyebrow: "Why agents join",
    benefitsTitle: "What you get on day one.",
    benefits: [
      {
        title: "An audience, handed to you",
        body: "You don't start from zero followers. Our 1,000,000+ community across 抖音, 小红书, and Instagram becomes the top of your funnel. Your listings, your face, and your story go out to people already watching Homix — so the leads find you, not the other way around.",
      },
      {
        title: "An in-house studio that makes you famous",
        body: "This is the SERHANT idea, localized for our market: media is how we sell. Our studio scripts, shoots, and edits short-form video, listing films, and personal-brand content for you — at no agency markup. You stay in front of clients; we make sure the camera loves you.",
      },
      {
        title: "AI and data tools that save your week",
        body: "Pricing comps, neighborhood data, lead follow-up, and listing copy in two languages — handled by our AI and data stack so you spend your hours with clients, not spreadsheets. Smart tech should serve the agent, not the other way around.",
      },
      {
        title: "Bilingual senior mentorship",
        body: "Whether you're newly licensed or stuck at a desk-fee shop, you're paired with senior agents who have actually closed in Flushing, Queens, and Long Island — in English and 中文. Real shadowing, real deal reviews, real introductions. You learn the market, not just the theory.",
      },
      {
        title: "Built for the bilingual market",
        body: "New York's Chinese-American buyers and sellers are an enormous, underserved market — and we are built for them in both languages. Marketing, contracts, and conversations happen in the language each client trusts, which means you can serve clients other agents simply can't reach.",
      },
      {
        title: "A real team, not a desk-fee factory",
        body: "Some brokerages just rent you a seat and collect a monthly fee. Homix invests in you because your wins are our story. Transparent economics, a clear path to grow, and a team that shows up — we'd rather have a smaller roster of stars than a warehouse of names.",
      },
    ],
    stepsEyebrow: "How to join",
    stepsTitle: "From hello to local star.",
    steps: [
      {
        title: "Apply and have a real conversation",
        body: "Send us your background — licensed, newly licensed, or considering the move. We'll sit down (in English or 中文) to understand your goals and tell you honestly whether Homix is the right fit.",
      },
      {
        title: "Build your brand kit",
        body: "Our studio shoots your intro content, sets up your bilingual profile, and plugs you into the Homix channels so the 1,000,000+ audience starts seeing your name and your listings.",
      },
      {
        title: "Get paired with a mentor and tools",
        body: "You're matched with a senior bilingual mentor and onboarded to our AI, data, and CRM tools — then you start working real leads with support beside you, not a manual to read alone.",
      },
      {
        title: "Grow into a local star",
        body: "As your deals and content compound, we scale your reach, your brand, and your earnings. The agents who lean in become the faces people in the neighborhood already recognize.",
      },
    ],
    whoEyebrow: "Who we're looking for",
    whoTitle: "Who we're looking for",
    whoBody: "You don't need a big book of business or a following — you need ambition and a willingness to show up on camera and in the community. We're a fit for newly licensed agents who want a real launchpad instead of a desk and a login, and for experienced agents who are stuck at a fee-factory brokerage and tired of generating every lead alone. Bilingual (English/中文) is a major plus given the clients we serve, but the non-negotiables are hunger, coachability, and integrity. If you want to be a local star and you're willing to do the work to get there, we want to talk.",
    faqEyebrow: "Questions",
    faqTitle: "Good to know.",
    faq: [
      {
        q: "I'm not licensed yet — can I still join?",
        a: "Talk to us early. We can't issue your license — that's the state — but we'll point you to the right pre-licensing course, and we're built to launch newly licensed agents. The mentorship, tools, and audience matter most exactly when you're starting out.",
      },
      {
        q: "How do the splits and economics work?",
        a: "We keep economics transparent and discuss them openly in your first conversation, because the right structure depends on your experience and goals. What we won't do is dress up a monthly desk fee as a 'partnership.' We invest in your brand and leads because your growth is how we grow.",
      },
      {
        q: "Do I need an existing following to benefit from the media engine?",
        a: "No — that's the entire point. You plug into our 1,000,000+ audience and in-house studio from day one. We build your personal brand from where you are; you don't need to arrive famous, you leave famous.",
      },
      {
        q: "Do I have to speak Chinese to work here?",
        a: "It's a strong advantage because so many of our clients are Chinese-American, and our team operates in both languages. But it isn't a hard requirement — drive, coachability, and integrity come first. We'll place you where you can win.",
      },
    ],
    ctaEyebrow: "Let's talk",
    ctaTitle: "Stop chasing leads alone. Become the headline.",
    ctaLead: "One conversation is all it takes to see what an audience, a studio, AI tools, and real mentorship could do for your career. Apply below — we'll reply in the language you prefer.",
    orReach: "Or reach us directly at",
  },
  journal: {
    eyebrow: "Journal",
    title: "Notes from an AI-first brokerage",
    lead: "Market data, neighborhood deep-dives, and a point of view worth reading — from the people who do the work.",
    readMore: "Read article",
    by: "By",
    backToJournal: "All articles",
    minRead: "min read",
  },
  offer: {
    eyebrow: "Make an offer",
    title: "Ready to make an offer?",
    lead: "Tell us the home and your terms. A Homix advisor reviews every submission and follows up — usually within one business day — to formalize your offer.",
    prepEyebrow: "Before you start",
    prepTitle: "What to have on hand",
    prep: [
      {
        title: "The property",
        body: "The address or MLS number of the home you want to offer on.",
      },
      {
        title: "Your terms",
        body: "Offer price, financing (cash or mortgage), down payment, and your ideal closing date.",
      },
      {
        title: "Proof of funds",
        body: "A pre-approval letter or proof of funds makes your offer stronger — have a PDF ready to upload.",
      },
    ],
    formEyebrow: "Offer details",
    fallbackTitle: "Online offers are being connected.",
    fallbackBody: "We're setting this up right now. In the meantime, call or message us and we'll take your offer directly.",
    talkToUs: "Contact us",
    disclaimer: "Submitting this form is a non-binding expression of interest, not a contract — a signed contract is required to be legally binding. Homix is an Equal Housing Opportunity brokerage. Information you share is handled under our Privacy Policy.",
  },
  buyercoach: {
    eyebrow: "Buyer Coach · AI",
    title: "Your AI buyer coach.",
    lead: "Ask anything about buying a home in the US. Trained on Homix's guides, in plain language, any time.",
    disclaimer: "Answers are general information generated by AI — not legal, financial, tax, or mortgage advice. Confirm anything important with a licensed Homix advisor.",
    fallbackTitle: "The coach is being connected.",
    fallbackBody: "Our AI buyer coach is coming online. In the meantime, reach a real advisor — we're glad to help.",
    talkToAdvisor: "Talk to an advisor",
  },
  toolDesc: {
    calculator: "Estimate your monthly payment",
    offer: "Submit an offer on a home",
    buyercoach: "AI answers for home buyers",
    onboarding: "How joining Homix works",
  },
  buyMenu: [
    { title: "Browse homes", desc: "Search every home for sale" },
    { title: "Neighborhoods", desc: "Guides to the areas we cover" },
    { title: "Mortgage calculator", desc: "Estimate your monthly payment" },
  ],
  onboarding: {
    eyebrow: "Agent Onboarding",
    title: "Your first 90 days at Homix, mapped out",
    lead: "Joining a brokerage should feel like joining a team that has already cleared the runway for you. This is the full picture of what onboarding at Homix Realty involves — from the moment you accept our offer in Flushing to the day you close your first deal. Six phases, no guesswork: licensing and compliance handled correctly under New York law, every account and system set up, a media kit and personal brand built in our in-house studio, and a bilingual mentor walking beside you the whole way.",
    visionMission: {
      eyebrow: "Homix Vision & Mission",
      title: "Build the most agent-forward real estate media company in New York.",
      lead: "Homix exists to give ambitious agents the platform, audience, systems, and mentorship that used to be reserved for large teams. We combine brokerage discipline with modern media so agents can grow faster, serve clients better, and become trusted local voices.",
      items: [
        {
          title: "Vision",
          body: "A brokerage where every serious agent can become a recognized expert, not just another name on a roster.",
        },
        {
          title: "Mission",
          body: "Help agents win with bilingual client service, compliant operations, AI-assisted tools, and a media engine that turns local expertise into real opportunity.",
        },
      ],
    },
    leadership: {
      eyebrow: "Leadership",
      title: "The people setting the standard.",
      lead: "You are joining a team led by operators who have built both production and attention: real estate performance, media reach, and hands-on mentorship under one roof.",
      people: [
        {
          name: "Si Zhang (Sunny)",
          role: "Founder · Licensed Real Estate Broker",
          image: "/onboarding/sunny-zhang.jpg",
          bio: "Sunny began his real estate career in 2013, built a record of top sales performance in China, and quickly became a top-producing New York broker after relocating to the United States. Before launching Homix in 2025, he built a digital media community of more than 400,000 followers and proved that trusted content can create real market leverage for agents and sellers.",
          focus: ["Brokerage strategy", "Media engine", "Agent personal brand"],
        },
        {
          name: "Heidi Liu",
          role: "Co-Founder · Licensed Real Estate Associate Broker",
          image: "/onboarding/heidi-liu.jpg",
          bio: "Heidi brings 13+ years of full-time New York real estate experience as a broker, branch manager, coach, mentor, investor, and homeowner. Known for relentless follow-up, market expertise, staging and marketing judgment, and a long Top Producer track record, she helps agents learn the practical standard behind a clean client experience and a strong transaction.",
          focus: ["Mentorship", "Transaction standards", "Client experience"],
        },
      ],
    },
    adminTeam: {
      eyebrow: "In-house admins",
      title: "The support desk behind your first deals.",
      lead: "Onboarding is not just training videos. These are the people who keep the office, marketing, and money flow organized while you learn the business.",
      members: [
        {
          name: "Grace Xia",
          role: "Office Manager",
          image: "/onboarding/grace.jpg",
          imagePosition: "50% 35%",
          body: "Your first stop for office coordination, onboarding checklists, account setup, scheduling, paperwork routing, and making sure the right person sees the right issue.",
        },
        {
          name: "Zoey Zhang",
          role: "Marketing Coordinator",
          image: "/onboarding/zoey.jpg",
          imagePosition: "50% 22%",
          body: "Supports agent profiles, content calendars, listing marketing requests, social media coordination, and the brand details that keep every agent looking consistent.",
        },
        {
          name: "Henry Ju",
          role: "Accounting / Finance",
          image: "/onboarding/henry-ju.jpg",
          imagePosition: "50% 26%",
          body: "Helps keep commissions, reimbursements, invoices, deal-related payments, and finance questions moving with clear records and timely follow-up.",
        },
      ],
    },
    adminChecklist: {
      eyebrow: "Admin onboarding checklist",
      title: "The internal checklist that keeps every new agent moving.",
      lead: "Use this as the office-side tracker for each new Homix agent. Every item has one owner, a clear handoff, and a reason it matters before the agent starts working leads.",
      groups: [
        {
          title: "Paperwork & license file",
          owner: "Office Manager",
          items: [
            "Signed Independent Contractor Agreement and commission tier recorded.",
            "W-9, direct deposit, emergency contact, and internal profile created.",
            "License transfer or sponsorship steps confirmed in eAccessNY.",
          ],
        },
        {
          title: "Systems access",
          owner: "Office Manager + Operations",
          items: [
            "@homix email, agent portal, CRM, AI workspace, and shared drive access issued.",
            "OneKey MLS onboarding status tracked and MLS rules orientation scheduled.",
            "Transaction tools, e-signature access, and compliant forms library bookmarked.",
            "Private website edit link sent and confirmed working.",
          ],
        },
        {
          title: "Branding & marketing",
          owner: "Marketing Coordinator",
          items: [
            "Agent bio rewritten, translated where needed, and approved for the website.",
            "Business cards, email signature, WeChat profile avatar creation, social bios, license details, and Equal Housing Opportunity disclosures prepared.",
            "For Sale sign, Open House sign, riders, QR codes, and print templates ready for first listing.",
          ],
        },
        {
          title: "Training & mentor handoff",
          owner: "Leadership + Mentor",
          items: [
            "Training video path assigned: foundations, buyer/seller playbooks, compliance, and media.",
            "Shadowing appointments, role-play sessions, and first consultation review scheduled.",
            "First-deal support path documented: who reviews offer terms, files, and timelines.",
          ],
        },
        {
          title: "Finance setup",
          owner: "Accounting / Finance",
          items: [
            "Commission split, payout method, and deal accounting notes entered.",
            "Invoice, reimbursement, and referral fee process explained.",
            "Agent understands what documents accounting needs before commission release.",
            "Finance contact and escalation path shared with the agent.",
          ],
        },
      ],
    },
    socialMedia: {
      eyebrow: "HOMIX social media",
      title: "A media engine agents can grow inside.",
      lead: "Homix is not only a brokerage brand. It is a network of recognizable IPs, company channels, bilingual content, and listing stories that help agents become known before the first client call.",
      image: {
        src: "/onboarding/homix-social-media-team.jpg",
        alt: "Homix social media IP team group portrait",
      },
      stats: [
        { value: "1M+", label: "cross-platform audience" },
        { value: "EN / 中文", label: "bilingual content engine" },
        { value: "IP", label: "agent personal-brand building" },
      ],
      pillars: [
        {
          title: "Company account exposure",
          body: "Agents may appear on Homix company channels when the topic, timing, and production plan fit the media calendar.",
        },
        {
          title: "Personal IP planning",
          body: "We help agents turn local expertise, language skills, and client stories into a repeatable content angle.",
        },
        {
          title: "Listing amplification",
          body: "Listings can be shaped into short-form tours, neighborhood stories, open house pushes, and bilingual captions.",
        },
        {
          title: "Studio-to-field rhythm",
          body: "The media team connects headshots, scripts, filming days, edits, and posting cadence so content stays consistent.",
        },
      ],
      channelsTitle: "Homix social media accounts",
      channels: [
        {
          key: "douyin",
          name: "Douyin / 抖音",
          handle: "@Homix 合美置地",
          body: "Douyin ID: 70077200788. Open the link or scan the QR code in Douyin.",
          url: "https://v.douyin.com/EPHD2ERjt3A/",
          image: "/onboarding/homix-douyin-qr.jpg",
          alt: "Homix Douyin QR code",
          width: 545,
          height: 545,
        },
        {
          key: "red",
          name: "RED / 小红书",
          handle: "homix合美置地｜乐居",
          body: "Follow Homix for bilingual real estate video, local market stories, and agent IP content.",
          url: "https://xhslink.com/m/2vk0nSDkvyq",
          image: "/onboarding/homix-xiaohongshu-qr-clean.jpg",
          alt: "Homix Xiaohongshu QR code",
          width: 306,
          height: 306,
        },
        {
          key: "instagram",
          name: "Instagram",
          handle: "@homix.realty",
          body: "Follow the Homix Realty account for listing visuals, agent media, events, and social proof.",
          url: "https://www.instagram.com/homix.realty?igsh=cWlwZm83aTA5b3h5&utm_source=qr",
          image: "/onboarding/homix-instagram-qr.jpg",
          alt: "Homix Instagram QR code",
          width: 410,
          height: 410,
        },
        {
          key: "wechat-channels",
          name: "WeChat Channels / 视频号",
          handle: "Homix 合美置地",
          body: "Scan the QR code in WeChat to follow the Homix video account.",
          image: "/onboarding/homix-wechat-channels-qr.jpg",
          alt: "Homix WeChat Channels QR code",
          width: 530,
          height: 530,
        },
      ],
    },
    resources: {
      eyebrow: "How Homix helps",
      title: "Onboarding resources you can actually use.",
      lead: "From your first login to your first closing, Homix gives you a working toolkit rather than a stack of PDFs.",
      detailComingTitle: "Detailed guide coming soon",
      detailComingBody: "We're putting together the full walkthrough for this resource. In the meantime, reach out and the office team will help you directly.",
      items: [
        {
          slug: "brokerage-operations",
          title: "Brokerage operations",
          body: "License sponsorship steps, compliance reminders, E&O guidance, forms, disclosure standards, and a clear escalation path when something feels sensitive.",
        },
        {
          slug: "eo-directives",
          title: "E&O / EO directives",
          body: "A clear operating standard for E&O coverage, Equal Opportunity and Fair Housing language, advertising review, and when to pause for broker guidance.",
        },
        {
          slug: "marketing-media",
          title: "Marketing & media",
          body: "Profile setup, headshots, intro reels, listing content, bilingual captions, social templates, and help turning neighborhood knowledge into publishable content.",
        },
        {
          slug: "self-branding",
          title: "Self branding procedure",
          body: "Business cards, email signature setup, Open House and For Sale sign designs, Homix domain presence, welcome/birthday/listing flyers, and optional custom media packages coordinated through marketing.",
        },
        {
          slug: "training-library",
          title: "Training library",
          body: "Foundations, buyer and seller playbooks, media lessons, compliance refreshers, and field-ready scripts for consultations, offers, and follow-up.",
        },
        {
          slug: "mentorship-deal-support",
          title: "Mentorship & deal support",
          body: "Shadowing, role-play, first-call review, listing presentation prep, transaction timeline support, and post-deal debriefs so every close becomes a lesson.",
        },
      ],
      mentorshipDealSupportDetail: {
        eyebrow: "Mentorship & deal support",
        title: "Everything you need to get started.",
        lead: "From your first day, you are paired with experienced agents and a system built to help you learn faster, build confidence, and close more deals.",
        items: [
          {
            title: "AI Tools & Systems",
            body: "Access cutting-edge AI tools to streamline marketing, content creation, lead management, and client communication.",
          },
          {
            title: "Social Media Growth",
            body: "Learn how to build your personal brand and generate business through social media strategies developed from Sunny's 300K+ audience across multiple platforms.",
          },
          {
            title: "One-on-One Mentorship",
            body: "Work closely with experienced agents through shadowing, role-playing, script practice, and real-life deal reviews.",
          },
          {
            title: "Transaction Support",
            body: "Receive guidance from contract to closing, ensuring every transaction becomes a valuable learning experience.",
          },
          {
            title: "Sales & Business Development",
            body: "Master lead generation, listing presentations, buyer consultations, negotiation skills, and business planning to accelerate your growth.",
          },
        ],
        closing: "Our goal is simple: help agents learn faster, build confidence, and close more deals.",
      },
      eoDirectivesDetail: {
        eyebrow: "E&O / EO directives",
        title: "Compliance instructions before any client-facing work.",
        lead: "This resource gathers the non-negotiables around Errors & Omissions coverage, Equal Opportunity and Fair Housing language, advertising review, and when to pause for broker guidance.",
        items: [
          {
            title: "E&O coverage first",
            body: "E&O may respond when a client complaint or claim arises from professional-service issues such as mistakes, omissions, negligence, document handling, communication misunderstandings, or insufficient disclosure.",
            items: [
              "E&O coverage, Fair Housing acknowledgment, and policy manual receipt logged.",
              "It is not a universal liability shield, and it does not allow an agent to admit fault, promise payment, or resolve a claim privately.",
              "Report the same day if a client says they want to complain, sue, or report the agent.",
              "Report attorney letters, demand letters, court documents, DOS complaints, MLS complaints, board complaints, or any request for money, commission refund, or compensation.",
              "Do not privately admit fault, promise compensation, or delete texts, WeChat messages, emails, recordings, or files.",
            ],
          },
          {
            title: "Equal Opportunity language",
            body: "Every public touchpoint should support Fair Housing and Equal Opportunity standards.",
            items: [
              "Use Equal Housing Opportunity language, logo, and disclosures where required.",
              "Do not steer, screen, discourage, or describe people by protected class.",
              "Keep neighborhood, school, safety, and demographic comments factual and source-based.",
              "Report the same day if a client alleges discrimination, misrepresentation, concealment, conflict of interest, or unclear dual-agency disclosure.",
              "Do not discuss client privacy details in group chats.",
            ],
          },
          {
            title: "Advertising & media review",
            body: "Listings, social posts, flyers, signs, and agent profiles must stay accurate, licensed, and on brand.",
            items: [
              "Confirm brokerage name, agent title, license details, and contact information before publishing.",
              "Use approved photos, claims, pricing, availability, and listing attribution.",
              "Route sensitive captions, guarantees, testimonials, or comparison claims for review first.",
              "Report the same day if listing information may be wrong, including price, size, taxes, school district, HOA, co-op, or condo information.",
            ],
          },
          {
            title: "Pause-and-ask rule",
            body: "If a situation feels legal, discriminatory, privacy-related, or financially sensitive, stop and escalate before replying.",
            items: [
              "Report the same day if a key document may be missing or signed incorrectly, including contract, offer, agency disclosure, lead paint, Fair Housing, or commission agreement paperwork.",
              "Report major disputes around deposit, closing date, contingency, mortgage commitment, inspection, or walkthrough.",
              "Do not argue with the client, privately reply to attorney letters or regulator emails, backfill documents, change dates, or edit chat records after the fact.",
              "Use this holding reply: \"I understand your concern. I will submit this issue to the company broker / office for formal review right away. To make sure the information is accurate, I will not judge responsibility or make any promises here. The company will respond as soon as possible.\"",
            ],
          },
        ],
        note: "When unsure, pause first. Broker review is part of the workflow, not a last resort.",
      },
      marketingMediaDetail: {
        eyebrow: "Marketing & media",
        title: "From profile setup to publish-ready content.",
        lead: "This is where a new agent becomes visible: profile polish, social account setup, headshots, intro reels, listing content, bilingual captions, and a practical content rhythm that can actually be maintained.",
        workflowTitle: "Media launch path",
        workflows: [
          {
            title: "Profile foundation",
            body: "Agent bio, headshot, contact details, language strengths, market focus, and compliant brokerage identity are cleaned up first.",
            items: [
              "Confirm preferred display name and title.",
              "Prepare website profile and social bio language.",
              "Align headshot, banner, email signature, and business card details.",
            ],
          },
          {
            title: "Social media setup",
            body: "Each platform gets a role, not just a login. We set up channels around trust, local expertise, listing visibility, and client follow-up.",
            items: [
              "Create or polish Google Business, Instagram, Facebook Business Page, LinkedIn, TikTok, and RED.",
              "Add compliant contact information, brokerage identity, and profile visuals.",
              "Prepare first bio, highlights, pinned posts, and bilingual caption direction.",
            ],
          },
          {
            title: "Content production rhythm",
            body: "The media team helps agents turn real expertise into repeatable content instead of one-off posts.",
            items: [
              "Plan intro video, neighborhood posts, listing tours, and education topics.",
              "Coordinate studio or field filming when the topic is ready.",
              "Review captions, disclosures, and posting cadence before publishing.",
            ],
          },
        ],
        socialTitle: "Social media setup",
        socialLead: "These are the platform basics Homix helps agents set up or polish during onboarding.",
        supportTitle: "What marketing can help with",
        supportItems: [
          "Profile copy, bilingual bio, and agent positioning.",
          "Headshots, intro reels, listing videos, and open house clips.",
          "Welcome, birthday, just listed, UC, and closed flyer templates.",
          "Company-account appearance planning for approved topics.",
          "Caption review, compliance checks, and content calendar planning.",
        ],
      },
      brokerageOperationsDetail: {
        eyebrow: "Brokerage operations",
        title: "Forms, systems, and deal support in one operating hub.",
        lead: "Use this page to find the correct brokerage form, confirm what must be submitted to the office, and understand which operating systems Homix agents may use during onboarding and active transactions.",
        masterSheetLabel: "Open master forms sheet",
        masterSheetUrl: brokerageFormsSheetUrl,
        workflowTitle: "How operations supports a deal",
        workflows: [
          {
            title: "Before paperwork",
            body: "Confirm the deal type, agency relationship, property type, and client role before selecting forms.",
            items: [
              "Ask operations when the situation is unusual or sensitive.",
              "Use the current master sheet instead of old downloaded copies.",
              "Confirm whether the blank form or a sample is needed.",
            ],
          },
          {
            title: "During the transaction",
            body: "Keep signatures, disclosures, deal sheets, and status updates clean so broker review can move quickly.",
            items: [
              "Upload or route signed documents as soon as they are ready.",
              "Flag missing disclosures before the file reaches closing.",
              "Keep notes clear enough for admin, accounting, and broker review.",
            ],
          },
          {
            title: "Before commission release",
            body: "Accounting needs the right closing documents, commission paperwork, and checks before payout can be processed.",
            items: [
              "Submit commission report and required checks promptly.",
              "Confirm referral, co-broke, or rental commission agreements.",
              "Escalate any commission split or invoice issue to accounting.",
            ],
          },
        ],
        toolsTitle: "Tools & systems",
        toolsLead: "Admin will confirm which logins apply to each agent. Keep credentials private and ask the office before adding client or transaction data into a new system.",
        tools: [
          {
            name: "Kevv",
            body: "Internal operating system used for assigned brokerage workflows, records, and agent-facing tasks when operations enables access.",
          },
          {
            name: "Keystory",
            body: "Listing and property-story workflow support for preparing listing information, property narratives, and client-facing presentation materials.",
          },
          {
            name: "Rescript",
            body: "Writing and script support for compliant client communication, listing copy, follow-up templates, and media-ready talking points.",
          },
          {
            name: "Google Drive forms library",
            body: "The live source for Homix forms, blank templates, sample documents, and office submission checklists.",
          },
          {
            name: "Transaction & e-signature tools",
            body: "Used for signatures, disclosures, file routing, and broker review when the deal requires formal document execution.",
          },
          {
            name: "MLS / listing systems",
            body: "Used for listing data, status changes, required fields, and property information that must match the signed paperwork.",
          },
        ],
        formsTitle: "Forms library",
        formsLead: "These forms come from the shared Homix forms sheet. Use Blank for a fresh form, Sample for a reference version, and check with operations before changing required language. If Google Drive asks for access, sign in with the Homix-approved Google account or request access from admin.",
        blankLabel: "Blank",
        sampleLabel: "Sample",
        formGroups: brokerageFormGroups,
        submissionTitle: "Documents to submit to the office",
        submissionLead: "Use these checklists to prepare files for listing, pending, closing, and rental milestones.",
        submissionGroups: brokerageSubmissionGroups,
      },
      socialPlatformsTitle: "Social media setup",
      socialPlatforms: [
        {
          key: "google",
          name: "Google Business",
          body: "Business profile setup, service area, photos, review link, and compliant contact details.",
        },
        {
          key: "instagram",
          name: "Instagram",
          body: "Professional bio, highlights, listing reels, local content cadence, and Homix brand alignment.",
        },
        {
          key: "facebook",
          name: "Facebook Business Page",
          body: "Business page basics, profile assets, contact buttons, posts, and open house promotion.",
        },
        {
          key: "linkedin",
          name: "LinkedIn",
          body: "Professional headline, brokerage role, credibility copy, and client-safe market updates.",
        },
        {
          key: "tiktok",
          name: "TikTok",
          body: "Short-form video profile, neighborhood hooks, listing-safe captions, and posting rhythm.",
        },
        {
          key: "red",
          name: "RED / Xiaohongshu",
          body: "Chinese-language profile setup, local lifestyle content, buyer education posts, and listing storytelling.",
        },
      ],
      selfBrandingDetail: {
        eyebrow: "Self branding procedure",
        title: "A polished agent identity before the first client call.",
        lead: "Homix gives each agent a consistent brand foundation: print templates, digital signatures, social-ready flyers, a Homix domain presence, and optional custom media packages for agents who want a stronger personal channel.",
        stepsTitle: "Company-provided brand assets",
        steps: [
          {
            title: "Business cards",
            body: "The office provides Homix business card design support with agent name, English display name, title, phone, email, office address, license disclosure, and QR/social placements.",
            items: [
              "Agent confirms name, title, phone, email, license information, and preferred social handles.",
              "Marketing prepares the proof and routes it for approval before printing.",
              "Final files stay on brand so every agent looks consistent in front of clients.",
            ],
            examples: [
              {
                title: "Homix business card",
                body: "Branded business card template with agent name, license disclosure, contact details, QR code, and headshot area.",
                image: "/onboarding/self-branding-business-card.png",
                alt: "Homix branded business card template for agent onboarding",
                width: 1044,
                height: 600,
              },
            ],
          },
          {
            title: "Email signature",
            body: "Every agent should update the signature in their email settings so client communication looks complete and professional.",
            items: [
              "Name, title, direct number, Homix Realty line, and office address.",
              "License and fair housing/equal opportunity language where needed.",
              "Clean formatting that works on Gmail, mobile mail, and desktop mail clients.",
            ],
            examples: [
              {
                title: "Email signature setup",
                body: "Recommended email signature structure for professional client communication.",
                image: "/onboarding/self-branding-email-signature.svg",
                alt: "Email signature setup example for Homix agent onboarding",
                width: 1600,
                height: 720,
              },
            ],
          },
          {
            title: "Open House & For Sale signs",
            body: "Homix provides Open House and For Sale sign designs that can be customized with agent headshot, contact details, QR code, property flyer space, and required disclosures.",
            items: [
              "Open House sign layout with agent photo and printable A4 flyer area.",
              "For Sale sign layout with agent profile, property contact path, QR code, and social icons.",
              "Marketing reviews placement, legibility, and compliance before production.",
            ],
            examples: [
              {
                title: "Open House sign",
                body: "Company-provided Open House sign design with headshot and flyer area.",
                image: "/onboarding/self-branding-open-house-sign.jpg",
                alt: "Homix Open House sign design template",
                width: 1600,
                height: 980,
              },
              {
                title: "For Sale sign",
                body: "Company-provided For Sale sign design with agent contact and QR placement.",
                image: "/onboarding/self-branding-for-sale-sign.jpg",
                alt: "Homix For Sale sign design template",
                width: 1600,
                height: 982,
              },
              {
                title: "For Sale sign (vertical)",
                body: "Vertical For Sale sign design with agent name, QR code, headshot area, and social icons.",
                image: "/onboarding/self-branding-for-sale-sign-vertical.jpg",
                alt: "Homix vertical For Sale sign design template",
                width: 732,
                height: 1106,
              },
            ],
          },
          {
            title: "Flyer templates",
            body: "The company provides repeatable flyer templates for common agent touchpoints so the agent can stay visible without rebuilding design from scratch.",
            items: [
              "Welcome flyer and birthday flyer.",
              "Just Listed, Under Contract, and Closed flyers.",
              "Social-ready and print-ready exports coordinated by marketing.",
            ],
          },
          {
            title: "Homix domain & custom package",
            body: "Agents can build a stronger online presence through Homix domain support and a private custom package for personal-brand content.",
            items: [
              "Homix domain/profile presence for a cleaner client link.",
              "Custom package options for personal brand assets, social content, and listing-ready design.",
              "Opportunity to appear on the company account when the topic and production plan fit the Homix media calendar.",
            ],
          },
        ],
        signatureTitle: "Suggested email signature fields",
        signatureLines: [
          "Name",
          "Licensed Real Estate Salesperson",
          "Direct: personal number",
          "Homix Realty",
          "Tel: (929) 666-9886",
          "37-20 Prince St, Suite 3H, Flushing, NY 11354",
        ],
        flyerTitle: "Available flyer types",
        flyerTypes: [
          "Welcome flyer",
          "Birthday flyer",
          "Just Listed flyer",
          "Under Contract / UC flyer",
          "Closed flyer",
        ],
        packageTitle: "Private custom package",
        packageBody: "For agents who want a stronger personal brand, Homix can coordinate a custom package that may include profile polish, social templates, short-form video planning, and approved appearances on the company account.",
      },
    },
    phases: [
      {
        title: "Phase 1 — Offer & Paperwork",
        blurb: "We start with clarity. Before any system or license, you and Homix put the working relationship in writing — your commission tier, what the brokerage provides, and what we expect of each other. Most of this happens in a single sit-down at our Flushing office, in the language you're most comfortable in.",
        items: [
          "Review and sign your Independent Contractor Agreement, which defines your commission split, tier, and how splits grow with production.",
          "Walk through the Homix policy manual and code of conduct — advertising rules, client handling, anti-discrimination and Fair Housing expectations.",
          "Complete tax and payroll setup: W-9, direct-deposit details, and emergency contact on file.",
          "Meet your onboarding lead and pick your bilingual (EN/中文) mentor track.",
          "Receive your onboarding roadmap — this six-phase plan with target dates for each milestone.",
        ],
      },
      {
        title: "Phase 2 — Licensing & Compliance",
        blurb: "Real estate is a licensed profession, and in New York it is taken seriously. Homix becomes your sponsoring broker — but the salesperson license is yours, applied for in your name through the NY Department of State. We make sure every step is done correctly the first time, because a clean license file is the foundation of everything that follows.",
        items: [
          "Confirm your 77-hour NY pre-licensing course completion and passing state exam score (or transfer an active license if you already hold one).",
          "Apply for your salesperson license via eAccessNY, entering Homix Realty Inc.'s broker UID as your sponsoring broker; we authorize the association from our side.",
          "Receive your DOS pocket card and license number — this number is disclosed on all your advertising and listings.",
          "Be added to Homix's Errors & Omissions (E&O) insurance and review your coverage.",
          "Complete required Fair Housing and Code of Ethics training so you start fully compliant.",
        ],
      },
      {
        title: "Phase 3 — Systems & Accounts",
        blurb: "With your license active, we switch on your toolkit. Homix gives you a single Homix ID that opens your email, CRM, the OneKey MLS, and our AI workspace — the same intelligence that powers our listings, valuations, and content. By the end of this phase you can log in once and reach everything you need to work a deal.",
        items: [
          "Activate your @homix email and Homix ID single sign-on for the agent portal.",
          "Gain OneKey MLS access through our association membership — covering Queens and the wider NYC metro — and complete the required MLS rules orientation.",
          "Set up your CRM: import contacts, connect lead routing, and learn how Homix-sourced leads land in your pipeline.",
          "Get onboarded to the Homix AI workspace — listing copy, valuations, bilingual translation, and content drafting.",
          "Install transaction and e-signature tools, and bookmark the brokerage's compliant forms library.",
        ],
      },
      {
        title: "Phase 4 — Brand & Media Kit",
        blurb: "This is where Homix is different. Most brokerages hand you a logo and wish you luck. We put you in front of a camera. Our in-house studio and 1M+ audience exist to make you visible from day one — so the market meets a Homix professional, not an anonymous new agent. This phase turns you into recognizable, on-brand media.",
        items: [
          "Book your in-house studio session: professional headshots, a short intro reel, and on-brand profile photography.",
          "Publish your agent profile with approved bio, contact details, license disclosure, and listing connection.",
          "Finalize brand essentials: business card proof, compliant email signature, social handles, and consistent bilingual profile copy.",
          "Prepare first-use marketing: For Sale and Open House sign assets, QR codes, reusable flyer templates, and one launch content plan with the media team.",
        ],
      },
      {
        title: "Phase 5 — Training & Mentorship",
        blurb: "Tools and a brand don't close deals — skill does. Homix is an agent incubator first, so we don't drop you in the deep end. You get a structured curriculum and a bilingual mentor who has done the work in this market. You'll learn how a Homix deal actually runs, from first call to closing table, before you ever do it for real.",
        items: [
          "Complete the Homix Foundations curriculum: pricing, buyer and seller consultations, contracts, and negotiation.",
          "Shadow your mentor on live appointments and a closing, and debrief each one together.",
          "Run role-play scripts for buyer consultations and listing presentations in English and 中文.",
          "Build your 90-day business plan: lead sources, content cadence, and weekly activity targets.",
          "Practice compliance in client-facing scenarios — agency disclosure timing, Fair Housing language, listing attribution, and when to escalate for broker review.",
        ],
        showVisualsOnOnboarding: false,
        visuals: [
          {
            title: "Buyer Boot Camp",
            subtitle: "买家精英实战营 · 6 weeks · 12 sessions",
            image: "/training/buyer-bootcamp.jpg",
            alt: "Buyer Boot Camp training poster",
            width: 1280,
            height: 2134,
          },
          {
            title: "The Listing Mastery Bootcamp",
            subtitle: "6 周系统训练营 · 6 weeks · 12 sessions",
            image: "/training/listing-bootcamp.jpg",
            alt: "The Listing Mastery Bootcamp training poster",
            width: 1080,
            height: 1920,
          },
          {
            title: "New York transaction pitfalls",
            subtitle: "Attorney Chen Heng · Apr 15, 2026 · 12 PM",
            image: "/training/ny-transaction-pitfalls.jpg",
            alt: "Flyer for Homix seminar on common issues in New York real estate transactions",
            width: 1131,
            height: 1600,
          },
          {
            title: "Mortgage process notes",
            subtitle: "Jing Rao mortgage team · Feb 13",
            image: "/training/mortgage-process-notes.jpg",
            alt: "Flyer for Homix mortgage process and risk notes seminar",
            width: 1079,
            height: 1600,
          },
          {
            title: "AI media event",
            subtitle: "Sunny Zhang & Eric Wei · Jan 22, 2026",
            image: "/training/ai-media-event.jpg",
            alt: "Flyer for Homix AI media and content operations event",
            width: 900,
            height: 1600,
          },
          {
            title: "Listing appointment week 3",
            subtitle: "Judy Markowitz · Apr 8 · 1 PM",
            image: "/training/listing-appointment-week3.jpg",
            alt: "Flyer for Homix week 3 listing appointment training",
            width: 898,
            height: 1600,
          },
          {
            title: "Loan strategy seminar",
            subtitle: "David Wu · Apr 10 · 11 AM",
            image: "/training/loan-seminar-david-wu.jpg",
            alt: "Flyer for Homix loan strategy seminar with David Wu",
            width: 1280,
            height: 1600,
          },
          {
            title: "No-income loan week 4",
            subtitle: "Li Li · Apr 13 · 11 AM",
            image: "/training/no-income-loan-week4.jpg",
            alt: "Flyer for Homix week 4 no-income loan training",
            width: 899,
            height: 1600,
          },
          {
            title: "Live workshop session",
            subtitle: "In-person scripts, Q&A, and deal practice",
            image: "/training/live-workshop.jpg",
            alt: "Homix agents studying scripts during a live workshop session",
            width: 908,
            height: 1600,
          },
          {
            title: "Cohort team session",
            subtitle: "Office training and team learning",
            image: "/training/training-team.jpg",
            alt: "Homix team members gathered in the office during training",
            width: 1600,
            height: 1199,
          },
          {
            title: "Office coaching moment",
            subtitle: "Hands-on support and milestone check-ins",
            image: "/training/training-milestone.jpg",
            alt: "Homix office coaching moment with agents after training",
            width: 1200,
            height: 1600,
          },
          {
            title: "Window roundtable session",
            subtitle: "In-office group coaching and discussion",
            image: "/training/roundtable-window-session.jpg",
            alt: "Homix agents gathered around the conference table for a training roundtable",
            width: 1199,
            height: 1600,
          },
        ],
      },
      {
        title: "Phase 6 — First Deal & Beyond",
        blurb: "Onboarding ends where your career begins: a real client and a real transaction, with the whole brokerage behind you. Your mentor, the media engine, the AI tools, and our operations desk stay close while you take a deal across the line. After it closes, we review what worked and set the rhythm that carries you into a steady, growing book of business.",
        items: [
          "Take your first lead from intake to signed agreement with mentor support at key decision points.",
          "Use the operations desk for contract review, timelines, and a smooth, compliant closing.",
          "Turn the win into content: a closing announcement and client story for the Homix channels.",
          "Hold a first-deal debrief with your mentor, then set the next 30-day activity rhythm.",
          "Map your path up the commission tiers and into Homix's advanced and leadership tracks.",
        ],
      },
    ],
    closingTitle: "You're never onboarding alone",
    closingBody: "Every phase here is something Homix does with you, not a checklist we hand off and forget. By the time you finish, you have an active New York license sponsored by Homix Realty, full OneKey MLS access, a complete tech and AI stack, a studio-built personal brand in front of a 1M+ audience, and a mentor who has already walked the same road. That is the difference between getting a job and being set up to win. Welcome to Homix.",
    clientGuides: {
      eyebrow: "Client Guides · New York · OneKey MLS",
      title: "Buyer & Seller playbooks",
      lead: "Step-by-step guides grounded in New York Real Property Law and OneKey MLS standards — ready to share with clients or use as a reference in consultations.",
      buyerCta: "Read the buyer guide",
      sellerCta: "Read the seller guide",
    },
    buyerGuide: {
      eyebrow: "New York Buyer Guide · Homix Realty",
      title: "How to buy a home in New York State",
      lead: "A complete walkthrough of the New York home-buying process — from assessing your budget to picking up the keys. Built on Homix Realty's hands-on experience in Queens, Long Island, and the greater NYC metro, covering financing, your buying team, Co-op boards, and every closing cost along the way.",
      steps: [
        {
          title: "01 — Assess Your Budget & the NY Market",
          body: "Before touring any home, take a full inventory of your finances and learn how New York's three ownership structures differ. Knowing what you can truly afford — and which property type fits — is the foundation of the entire process.",
          items: [
            "Budget rule of thumb: keep your monthly payment under 28–36% of pre-tax income. Plan for down payment + closing costs (about 2–5% of price) + renovation budget + 3–6 months emergency reserve.",
            "Know your credit: a FICO score of 620+ qualifies for conventional loans; 740+ earns the best rates. Gather 2 years of W-2s, tax returns, bank statements, and asset proof (self-employed buyers also need 2 years of business returns and a P&L).",
            "Co-op: you buy shares in a corporation, not real property — lower prices, but board approval required and loans usually capped at 80%. Condo: true ownership, fewer restrictions, higher price and closing costs. House/Townhouse: you own the land, mostly in the outer boroughs, with property tax and upkeep.",
            "Down payment by loan type: Conventional 3–20% (PMI under 20%), FHA 3.5% (580+ score), VA 0% (veterans), Jumbo 10–20%+ (over $806,500 in 2025). Co-op boards often demand 20–25% down, sometimes 50%+, and frequently reject FHA/VA loans.",
          ],
        },
        {
          title: "02 — Build Your Buying Team",
          body: "In New York, a professional team is the key to a smooth purchase. Line up these core members before you get serious about any property.",
          items: [
            "Buyer's agent: represents your interests in search, offers, and negotiation. Choose a NY-licensed agent who knows your target area (note: commission rules changed after 2024 — confirm the structure upfront).",
            "Real estate attorney: New York law effectively requires buyers to have one. They review the contract, handle title, and attend closing — typically $2,000–$5,000.",
            "Mortgage broker / lender: secures your pre-approval and the best rate. Contact 2–3 lenders to compare offers.",
            "Home inspector ($300–$600) and title company: the inspector checks structure and systems; the title company runs the title search and issues title insurance (usually recommended by your attorney or bank).",
          ],
        },
        {
          title: "03 — Get Pre-Approved",
          body: "Submit your income, asset, and credit documents to a lender, who issues a Pre-Approval Letter stating how much you can borrow. In the New York market, sellers will not take an offer seriously without one.",
          items: [
            "Provide income, asset, and credit documentation to your bank or mortgage broker.",
            "Receive a written Pre-Approval Letter stating the approved loan amount.",
            "Pre-approval letters are valid for 60–90 days — expired letters must be re-issued.",
            "Pre-Qualification (an informal estimate) is not the same as Pre-Approval (an underwritten commitment) — only the latter carries weight in a competitive offer.",
          ],
        },
        {
          title: "04 — Find the Right Property",
          body: "Browse listings, refine your criteria with your agent, and tour homes in person. Pay attention to what photos can't show — light, layout, building condition, and the rules that come with the property.",
          items: [
            "Search StreetEasy, Zillow, Realtor.com, and OneKey MLS; tell your agent exactly what you need — type, size, floor, school district.",
            "At open houses and private showings, evaluate natural light, floor plan, surroundings, and building management quality.",
            "For Co-ops, review the House Rules and Proprietary Lease to understand building regulations and subletting policy.",
            "Check each home's sales history and any changes in maintenance / common charges over time.",
          ],
        },
        {
          title: "05 — Submit Your Offer",
          body: "Submit a formal offer with your price, down payment, loan terms, and target closing date. In a hot market, popular homes may draw multiple offers (a bidding war) — and until the contract is signed, either side can still walk away.",
          items: [
            "Your written offer states price, down-payment percentage, loan terms, and proposed closing date.",
            "Once accepted, both sides enter contract negotiation — either party may still exit at this stage.",
            "Build in protection: an Inspection Contingency and a Mortgage Contingency.",
            "All-cash offers, fast closings, and flexible terms are typically more attractive to sellers.",
          ],
        },
        {
          title: "06 — Sign the Contract of Sale",
          body: "The seller's attorney drafts the contract; your attorney reviews and negotiates the terms (usually 1–2 weeks). In New York, the contract — not the accepted offer — is the binding legal document.",
          items: [
            "When you sign, you pay an Earnest Money Deposit, typically 10% of the purchase price, held in your attorney's escrow account until closing.",
            "The contract should clearly specify price, closing date, included items (appliances, etc.), and all contingency clauses.",
            "Once signed, the contract is legally binding — a buyer who walks away without cause forfeits the entire deposit.",
            "Co-op buyers: the contract usually includes a board-approval contingency — if the board rejects you, you recover your deposit.",
          ],
        },
        {
          title: "07 — Apply for Your Mortgage",
          body: "Submit your full loan application to the bank (usually within 5–7 business days of contract). Underwriting typically takes 30–45 days, during which the lender appraises the property and verifies every detail.",
          items: [
            "The bank orders an Appraisal — the result directly affects loan approval.",
            "Stay reachable and submit any additional documents promptly to keep underwriting on schedule.",
            "During this period: do not change jobs, overspend, or open/close credit cards — any of these can jeopardize approval.",
            "The lender issues a Commitment Letter, usually valid through the scheduled closing date.",
          ],
        },
        {
          title: "08 — Inspection & Due Diligence",
          body: "Hire a professional to fully inspect the property — structure, electrical, plumbing, roof, foundation. New York law lets a buyer exit the contract over major issues at this stage, provided the contract includes an inspection contingency.",
          items: [
            "After receiving the report, you may request necessary repairs or a price reduction for any problems found.",
            "Co-op buyers should review: financial statements, board meeting minutes, reserve fund status, and any planned special assessments.",
            "Condo buyers should review: HOA rules, reserve fund status, and litigation history.",
            "For detached houses, consider additional checks: lead paint, asbestos, underground oil tanks, and the sewer/drainage system.",
          ],
        },
        {
          title: "09 — Co-op Board Application (if applicable)",
          body: "Co-op purchases require board approval. You assemble a complete Board Package, sit for an interview, and await the board's decision — a process unique to Co-ops and often the most demanding part of the purchase.",
          items: [
            "Prepare a full Board Package: financial statements, tax records, bank statements, reference letters, and a personal statement — often dozens of pages, assembled with help from your attorney and agent.",
            "After submission, you attend a Board Interview answering questions about your living plans and finances.",
            "Approval typically takes 2–4 weeks; some Co-ops apply stricter standards.",
            "A board may reject an applicant without giving a reason — if rejected, you recover your contract deposit.",
          ],
        },
        {
          title: "10 — Pre-Closing & Closing Day",
          body: "In the final stretch, your attorney confirms clear title, the bank issues final loan documents, and you wire your funds. On closing day, buyer, seller, both attorneys, and the bank and title representatives gather to sign everything and transfer ownership.",
          items: [
            "Pre-closing checklist: attorney confirms the title search is clear and arranges title insurance; review the Closing Disclosure (loan amount, rate, payment, all closing costs) carefully against your numbers.",
            "Wire your closing funds 1–2 business days ahead so they clear in time, and bring government-issued photo ID (driver's license or passport).",
            "Within 24 hours of closing, do a Final Walk-Through to confirm the home matches the contract and all included items remain.",
            "At closing: sign the bank documents (Promissory Note, Mortgage Agreement) and the Deed (about 30–60 minutes each), funds are distributed through escrow, and once the seller confirms receipt, you get the keys.",
          ],
        },
        {
          title: "11 — Understanding Closing Costs",
          body: "New York closing costs are among the highest in the country — buyers should budget an extra 2–6% of the purchase price (typically 1.5–3% in NYC). Knowing each line item in advance prevents surprises at the table.",
          items: [
            "Typical buyer costs: attorney fees ($1,500–$3,500), home inspection ($500–$1,000), title insurance and title search, mortgage recording tax, bank/loan fees, and pro-rated property taxes.",
            "Mansion Tax: on purchases of $1,000,000 or more, the buyer pays an extra 1–3.9%, graduated by price.",
            "Co-op, Condo, and House each carry different fee structures — your advisor gives you an itemized estimate specific to your property type before you commit.",
            "Beyond the down payment, keep reserves for renovation and 3–6 months of carrying costs — and, for Co-ops, the 1–2 years of payments + maintenance many boards require as post-closing liquidity.",
          ],
        },
      ],
    },
    sellerGuide: {
      eyebrow: "New York Seller Guide · Homix Realty",
      title: "How to sell a home in New York State",
      lead: "A complete walkthrough of the New York residential sale process — from pre-listing preparation to closing day. Built on Homix Realty's hands-on experience in Queens, Long Island, and the greater NYC metro, covering every step from pricing to your net proceeds.",
      steps: [
        {
          title: "01 — Know Your Property Type & Gather Documents",
          body: "New York's residential market has three main ownership structures — Co-op, Condo, and House — and each has a different sale process. Co-ops are the most complex: you are selling shares in a corporation, not real property, and every buyer must be approved by the building's board of directors (a process that typically takes 4–8 weeks). Condo and house sales have fewer restrictions and move faster.",
          items: [
            "Co-op sellers must understand the building's subletting rules, mortgage ratio limits, and board package requirements before accepting any offer — a deal that collapses after contract execution wastes months.",
            "Gather these documents early: deed or stock certificate, last 12 months of maintenance/HOA statements, property tax bill, renovation permits, building financials (for co-ops/condos), and your mortgage payoff statement.",
            "Have title insurance policy and any outstanding lien information ready for your attorney.",
            "For pre-1978 homes, a federal Lead-Based Paint Disclosure is required — buyers receive 10 days to test.",
          ],
        },
        {
          title: "02 — Market Analysis & Pricing Strategy",
          body: "Pricing is the single most important decision in your sale. A Comparative Market Analysis (CMA) draws on recently closed sales, active competition, and expired listings to place your home accurately in today's market. The goal is to attract serious buyers, not to test what the market will bear.",
          items: [
            "Your Homix advisor builds a CMA from recent sales in the same area with similar size, condition, floor, and features — then adjusts for your home's unique selling points (views, parking, renovation quality).",
            "Pricing strategies: at-market attracts reliable demand; 3–5% below market can trigger a competitive bidding situation; 5–10% above market risks sitting unsold and requiring a price cut that signals weakness.",
            "Seasonal timing matters: spring (March–June) is peak season with the most active buyers; fall (September–November) is the second-best window; summer and winter are slower.",
            "We provide a net-proceeds estimate before you list — so you know exactly what you walk away with after commissions, taxes, and fees.",
          ],
        },
        {
          title: "03 — Prepare Your Home",
          body: "Research shows professionally staged and prepared homes sell for 6–10% more than unprepared ones and spend less time on market. New York buyers are experienced and compare multiple properties — preparation is not optional, it is a return on investment.",
          items: [
            "Deep clean everything, remove personal items and family photos, and simplify decor so buyers can imagine their own lives in the space.",
            "Address small repairs before listing: leaking faucets, cracked walls, sticking doors, damaged light fixtures — anything a buyer's inspector will flag gives buyers a reason to negotiate down.",
            "High-ROI upgrades: neutral paint ($500–$2,000), updated hardware and switch plates, fresh caulk in bathrooms. These cost little and read as well-maintained.",
            "Professional photography (20–30 wide, well-lit images) and a 3D virtual tour (Matterport) are essential — over 90% of buyers screen online before visiting in person.",
          ],
        },
        {
          title: "04 — Choose Your Agent & Sign the Listing Agreement",
          body: "In New York, virtually all sellers work with a licensed real estate agent. A strong listing agent brings a pricing strategy, marketing plan, negotiation skill, and transaction management that typically generates far more value than the commission. Verify any agent's license at the NY Department of State website before signing.",
          items: [
            "Evaluate agents on: local sales history (volume, price, days on market in your neighborhood), marketing plan (MLS, StreetEasy, social media, bilingual reach), and clear communication in your preferred language.",
            "The Exclusive Right to Sell agreement sets listing price, commission rate, term (typically 3–6 months), marketing authorizations, and early termination terms — read every clause.",
            "Following the 2024 NAR settlement, buyer and seller commissions are now negotiated separately. Ask your agent to explain the current commission structure in writing before signing.",
            "New York State requires the Agency Disclosure form to be presented at first substantive contact — review it to understand whether your agent is your exclusive representative or could represent both sides.",
          ],
        },
        {
          title: "05 — List & Market Your Home",
          body: "Once the listing agreement is signed and the home is prepared, your property enters the market. Maximum exposure in the first days is critical — buyer attention peaks at launch, and a listing that sits generates price-reduction stigma.",
          items: [
            "Your listing goes live on OneKey MLS and syndicates automatically to StreetEasy, Zillow, Realtor.com, and dozens of partner portals.",
            "Homix layers its own bilingual media on top: short-form video, neighborhood content, and targeted outreach to its 1M+ audience across 抖音, 小红书, and Instagram — reaching Chinese-speaking buyers who never visit English-only portals.",
            "Open houses: Sunday 1–4 PM is the prime window in the New York metro. Prepare printed bilingual brochures, maximize natural light, control temperature, and — critically — have the seller leave so buyers speak freely.",
            "Private showings are scheduled via OneKey MLS ShowingTime; your advisor collects post-showing feedback and flags any patterns (price concerns, condition issues, strong interest) in real time.",
          ],
        },
        {
          title: "06 — Evaluate Offers & Negotiate",
          body: "When offers arrive, price is only one of six dimensions to evaluate. Your advisor presents every offer — New York law requires prompt presentation — and helps you weigh the full picture before responding.",
          items: [
            "Evaluate: offer price, down payment size (higher down = stronger buyer), loan type (all-cash carries lowest risk), contingencies (inspection, financing, co-op board), proposed closing timeline, and — for co-ops — the buyer's likelihood of board approval.",
            "For co-ops, a buyer with slightly lower price but a clean financial profile and strong board package is often worth more than the highest bidder with a shaky application.",
            "With 3+ offers, your advisor can call for highest-and-best with a set deadline to create urgency. With 1–2 offers, direct counter-negotiation is standard.",
            "Common seller negotiating tools: flexibility on closing date, including appliances or furniture, covering a portion of buyer closing costs, or offering a repair credit in lieu of fixes.",
          ],
        },
        {
          title: "07 — Contract of Sale & Your Attorney",
          body: "Unlike most U.S. states, New York real estate contracts are drafted and negotiated by attorneys — not agents. You need a licensed New York real estate attorney before any offer is accepted. Expect the contract phase to take 1–2 weeks.",
          items: [
            "The process: buyer and seller agree on a term sheet → your attorney drafts the purchase contract (3–5 business days) → buyer's attorney reviews and redlines → both sides negotiate and finalize → buyer signs and wires the contract deposit.",
            "The contract deposit is typically 5–10% of the purchase price, held in your attorney's escrow account. If the buyer defaults without a valid contingency, you may keep the deposit.",
            "Attorney fees for sellers typically run $2,000–$4,000. Choose an attorney with specific Co-op or Condo experience — the wrong attorney can cause costly delays.",
            "For co-op sales, board package preparation begins immediately after contract execution. Push the buyer's agent to start early — board review alone takes 4–8 weeks.",
          ],
        },
        {
          title: "08 — Inspection & Appraisal",
          body: "After the contract is signed, the buyer conducts a professional home inspection and the buyer's lender orders an appraisal. Both can affect your deal — but both are manageable with the right preparation and advisor.",
          items: [
            "Home inspection covers structure, electrical, plumbing, HVAC, roof, and foundation. Buyers may request repairs, a price reduction, or a credit — your attorney and advisor help you respond appropriately without over-conceding.",
            "For detached houses, additional inspections may include lead paint, asbestos, underground oil tanks, and sewer lines. Knowing your home's condition in advance reduces surprises.",
            "Bank appraisal: if the lender's appraiser values the property below the contract price, the buyer may request a renegotiation. Pricing accurately from the start — grounded in real comps — is the best defense against a low appraisal.",
            "For co-op transactions, the buyer's attorney also reviews the building's financial statements and meeting minutes — significant issues discovered here can allow the buyer to exit the contract.",
          ],
        },
        {
          title: "09 — Closing Day",
          body: "Closing typically occurs 45–90 days after contract execution (co-ops often take longer due to board review). The deed or stock certificate transfers, funds are disbursed, and you hand over the keys. Before closing day, a pre-closing checklist keeps everything on track.",
          items: [
            "Closing checklist: confirm all agreed repairs are complete; arrange utility account transfers or cancellations; obtain a payoff letter from your lender (with an expiration date); prepare all keys, fobs, parking remotes, and mailbox keys.",
            "Review the closing disclosure / settlement statement with your attorney before closing day — verify every line item for accuracy.",
            "Final walkthrough: the buyer inspects the property 24 hours before closing to confirm condition matches the contract. Address any discrepancies before arriving at the table.",
            "At closing: both attorneys attend, documents are signed (deed transfer, tax filings), the buyer wires the remaining balance, and net proceeds are wired to your designated account — typically same day or next business day.",
          ],
        },
        {
          title: "10 — Seller Taxes & Net Proceeds",
          body: "New York seller closing costs are among the highest in the country — typically 8–10% of the sale price when commissions, transfer taxes, and attorney fees are combined. Understanding each item before you list lets you plan accurately and avoid surprises at the table.",
          items: [
            "Broker commission: 5–6% of sale price (historically includes buyer's agent; structure now negotiated separately post-2024 NAR settlement). NY State Transfer Tax: 0.4% (0.65% on sales over $3M). NYC Transfer Tax (RPTT): 1% under $500K; 1.425% over $500K.",
            "Capital gains tax on profit: federal rate 0%, 15%, or 20% depending on income and holding period; NY State adds up to 10.9% on top. Section 121 exemption: individuals may exclude up to $250,000 of gain; married couples filing jointly up to $500,000 — if the home was your primary residence for at least 2 of the last 5 years.",
            "FIRPTA: if you are not a US citizen or tax resident, the buyer is required to withhold 15% of the sale price and remit it to the IRS. This is often much higher than your actual tax — consult a CPA and apply for a Withholding Certificate before closing.",
            "Co-op flip tax: many co-op buildings charge a transfer fee (typically 1–3% of sale price or a per-share amount) — check your proprietary lease. Budget for attorney fees ($2,000–$4,000) and any outstanding mortgage payoff. Get a full net-proceeds estimate from your advisor before you list.",
          ],
        },
      ],
    },
  },
  agentsPage: {
    eyebrow: "The team",
    title: "Our advisors",
    lead: "A bilingual team across Queens, Long Island, and Manhattan — each one a licensed New York professional who knows the neighborhoods firsthand.",
    contact: "Contact",
    licenseNo: "License #",
  },
  contactPage: {
    eyebrow: "Contact",
    title: "Start a quiet conversation.",
    lead: "Buying, selling, or just thinking it through — we're glad to help, with no pressure and no obligation.",
    byPhone: "By phone",
    byEmail: "By email",
    inPerson: "In person",
  },
  neighborhoodsPage: {
    eyebrow: "Neighborhoods",
    title: "The places we know best",
    lead: "Local guides to the New York neighborhoods where Homix works most closely.",
    viewHomes: "View homes here",
    backToAll: "All neighborhoods",
    photoBy: "Photo",
    whyEyebrow: "Neighborhood Intelligence",
    whyTitle: "We don't sell zip codes. We read neighborhoods.",
    whyBody: "From Downtown Flushing to the North Shore villages of Nassau County, these are the markets Homix works in every week. Our agents grew up here, shop here, and ride these trains — so our guidance is grounded in lived knowledge, not a portal listing. For each neighborhood we pair that local fluency with disciplined data: how homes are actually pricing, which school districts hold their reputation, what the commute really looks like, and where supply and demand are heading. The result is bilingual, fair-housing-conscious counsel you can act on, whether you're buying your first co-op near the 7 train or trading up to a colonial in a top-ranked school zone.",
    methodology: [
      {
        title: "Comps & pricing discipline",
        body: "We price from recent, genuinely comparable sales — adjusting for floor, condition, lot, and view rather than headline list prices. Buyers get an offer strategy backed by evidence; sellers get a number the market will actually support, so homes don't sit and don't leave money on the table.",
      },
      {
        title: "Schools & zoning",
        body: "On Long Island especially, the school district line can matter more than the street. We confirm which district and attendance zone a home actually falls in, track each district's long-standing reputation rather than a single year's ranking, and flag zoning or co-op board rules that shape what you can buy and how.",
      },
      {
        title: "Transit & access",
        body: "We map the real commute — which subway lines, LIRR branch, ferry, or highways serve a home, and how that translates into door-to-door time and resale appeal. Proximity to a station or express service is a durable value driver, and we weigh it the way buyers and future buyers will.",
      },
      {
        title: "Supply, demand & timing",
        body: "We watch inventory, days-on-market, and seasonal rhythm by neighborhood so timing works for you, not against you. Knowing whether a market favors buyers or sellers — and when listings typically surge — turns a stressful guess into a planned move.",
      },
    ],
    glanceTitle: "At a glance",
    glanceLabels: {
      transit: "Getting around",
      schools: "Schools",
      character: "Character",
      bestFor: "Best for",
    },
  },
  notFound: {
    eyebrow: "404",
    title: "This page has moved on.",
    lead: "The page you're looking for isn't here. Let's get you back to the homes.",
    backHome: "Back home",
    browseListings: "Browse listings",
  },
  legal: {
    note: "Have qualified counsel and the broker of record review legal text before launch.",
    lastUpdated: "Last updated",
  },
  sell: {
    eyebrow: "Sell with Homix",
    title: "Sell where the buyers already are.",
    lead: "Most homes wait on a portal to be found. Homix launches yours as content to a 1,000,000+ audience across 抖音, 小红书, and Instagram — in English and 中文 — reaching qualified, often cash-ready buyers other brokerages can't. The result: broader demand, a faster sale, and more money in your pocket.",
    heroCta: "Get your free valuation",
    proof: {
      eyebrow: "The Homix difference",
      items: [
        { value: "1,000,000+", label: "Audience we reach" },
        { value: "EN · 中文", label: "Bilingual marketing" },
        { value: "抖音 · 小红书 · IG", label: "Where we publish" },
        { value: "Flushing · NYC · LI", label: "Where we go deep" },
      ],
    },
    advantagesEyebrow: "Why sell with Homix",
    advantagesTitle: "An unfair advantage for your listing.",
    advantages: [
      {
        headline: "Your home launches to an audience we already own",
        body: "Most listings sit on a portal waiting to be found. We broadcast yours on day one to a 1,000,000+ following across 抖音, 小红书, and Instagram — real buyers already watching New York real estate. More eyes in the first days means more showings, faster, and the demand that creates competing offers.",
      },
      {
        headline: "We reach buyers in the language they buy in",
        body: "We market and negotiate fully in English and 中文, opening your home to the large, often cash-ready Chinese-speaking buyer pool across Flushing, Queens, and Long Island — including overseas buyers who research on 微信, 小红书, and 抖音, not English-only portals. That's a bigger, more qualified buyer base, which national English-only brokerages can't tap in-house.",
      },
      {
        headline: "Your home becomes a story, not a slideshow",
        body: "Our in-house studio films your home the way a brand films a product — cinematic walk-throughs, short-form tours, and bilingual storytelling built to travel on social, not just sit in an MLS gallery. Presentation is what makes buyers stop scrolling and book a showing — and what lets a home command its price.",
      },
      {
        headline: "Priced with data, decided by a person",
        body: "We cross-check multiple valuation models against a hand-built set of local comparable sales and live demand signals, then a licensed Homix advisor sets your number and walks you through exactly how we got there. Pricing right from day one is how you avoid the stale-listing discount and sell for more.",
      },
      {
        headline: "We engineer the first days, when it matters most",
        body: "A listing draws its peak attention in its first days live. We line up a coming-soon audience and launch across every channel at once, so interest lands all at the same time instead of trickling in — the raw material for momentum and multiple offers, rather than a home that slowly goes stale.",
      },
      {
        headline: "We handle it, so you don't have to",
        body: "Staging guidance, photography, marketing, showings, negotiation, attorney and closing coordination — handled end to end by the advisor whose name is on the door. Selling is one of the most stressful things people do; our job is to take the weight off and keep the deal moving to the closing table.",
      },
      {
        headline: "Hyper-local, from people who walk these streets",
        body: "We know Flushing, Queens, and the Long Island North Shore block by block — the comps, the school districts, what local buyers actually pay for. That local read is how we price with confidence and defend your number when offers come in.",
      },
      {
        headline: "You see the comps, the data, and the reasoning",
        body: "No black-box estimate, no take-our-word-for-it. We show you the comparable sales, the market data, and the reasoning behind your price and your strategy — and we give you a clear net-proceeds estimate up front, before you list.",
      },
    ],
    howEyebrow: "How it works",
    howTitle: "Four steps from listed to closed.",
    steps: [
      {
        title: "Valuation & strategy",
        body: "A free, data-backed valuation. We set your price and the plan together — and show our reasoning.",
      },
      {
        title: "Prep & production",
        body: "Staging guidance, then our in-house studio films your home into bilingual content built for social.",
      },
      {
        title: "Media launch",
        body: "A coming-soon warm-up, then a day-one broadcast to our 1,000,000+ audience across every channel.",
      },
      {
        title: "MLS, offers & closing",
        body: "Full MLS and portal syndication, offer negotiation, and attorney and closing coordination — handled for you.",
      },
    ],
    valuationEyebrow: "Free home valuation",
    valuationTitle: "What's your home worth?",
    valuationLead: "Tell us about your home and a Homix advisor will prepare a complimentary, no-obligation valuation.",
    valuationAssurances: ["Free & no-obligation", "We reply within one business day", "Confidential"],
    orCall: "Or call",
    listingsCta: {
      kicker: "Thinking of selling?",
      line: "Your home deserves more than a yard sign. We launch it to a 1,000,000+ bilingual audience — and reach buyers other brokerages can't.",
      button: "Sell with Homix",
    },
  },
  calculator: {
    eyebrow: "Tools",
    title: "Mortgage calculator",
    lead: "Estimate your monthly payment. For guidance only — talk to a lender for an exact quote.",
    homePrice: "Home price",
    downPayment: "Down payment",
    interestRate: "Interest rate",
    loanTerm: "Loan term (years)",
    monthlyPayment: "Estimated monthly payment",
    principalInterest: "Principal & interest",
    loanAmount: "Loan amount",
    disclaimer: "Estimates principal and interest only; taxes, insurance, and HOA are not included. Not a loan offer.",
  },
};

type Dict = typeof en;

const zh: Dict = {
  common: {
    listings: "买房",
    advisors: "经纪人",
    journal: "观察",
    sell: "卖房",
    join: "加入我们",
    about: "关于",
    contact: "联系",
    neighborhoods: "社区",
    offer: "提交报价",
    buyercoach: "买家教练",
    tools: "经纪人门户",
    onboarding: "入职",
    training: "培训",
    privacy: "隐私政策",
    terms: "服务条款",
    accessibility: "无障碍",
    fairHousing: "公平住房",
    standardOperatingProcedures: "标准操作流程",
    explore: "探索",
    firm: "公司",
    legal: "法律",
    backHome: "返回首页",
    viewProfile: "查看主页",
    calculator: "房贷计算器",
    agentLogin: "经纪人登录",
    langLabel: "EN",
  },
  footer: {
    eho: "Homix Realty Inc. 恪守《公平住房法》与《平等机会法》。我们不因种族、肤色、宗教、性别、残障、家庭状况或国籍而歧视。所有信息力求可靠，但不作保证。",
    brokerOfRecord: "持牌经纪人",
    licensedIn: "持牌州",
    rights: "保留所有权利。",
  },
  hero: {
    eyebrow: "纽约地产 · 媒体 · AI",
    title: "好房，自带头条。",
    lead: "纽约首家以媒体驱动的地产公司。我们卖房、孵化明星经纪人、运营内容机器——100 万+ 全网粉丝与 AI 营销，传统经纪公司望尘莫及。",
    ctaPrimary: "浏览房源",
    ctaSecondary: "认识团队",
  },
  brandStory: {
    eyebrow: "关于公司",
    title: "我们不是又一家经纪公司，而是一家地产媒体公司。",
    p1: "Homix 融合 home 与 mix：经纪、媒体工作室、经纪人孵化器集于一体。爆款视频、生活方式内容与 100 万+ 粉丝，把每一套房、每一位经纪人推到市场面前。",
    p2: "由此带来同行难以企及的曝光、更快的成交，以及一支深耕皇后区、长岛与曼哈顿的双语团队——背后是让每一步都更精准的数据与 AI。",
  },
  pillars: {
    eyebrow: "我们做什么",
    title: "与 Homix 合作的三种方式",
    items: [
      {
        eyebrow: "买房 · 卖房",
        title: "找到或卖出你的家",
        body: "覆盖皇后区、长岛与曼哈顿的全程服务——配上让同行汗颜的营销能力。",
        cta: "浏览房源",
      },
      {
        eyebrow: "加入我们",
        title: "成就你的事业",
        body: "加入这家把流量交到你手里的经纪公司。媒体培训、个人 IP、客源与 AI 工具——我们把经纪人打造成明星，而不只是招人。",
        cta: "加入我们",
      },
      {
        eyebrow: "媒体 · 流量",
        title: "触达更多买家",
        body: "拥有 100 万+ 粉丝的内容工作室，产出视频、运营投放，把房与人推到整个市场面前。",
        cta: "合作媒体业务",
      },
    ],
  },
  stats: {
    items: [
      { value: "100万+", label: "全网粉丝" },
      { value: "40+", label: "经纪人" },
      { value: "头部", label: "纽约内容型经纪" },
      { value: "中 / EN", label: "双语服务" },
    ],
  },
  valueProps: [
    {
      title: "媒体即市场",
      body: "我们生于自媒体平台——爆款视频、生活方式内容，以及把每套房迅速送到对的买家面前的 100 万+ 粉丝。",
    },
    {
      title: "我们把经纪人打造成明星",
      body: "Homix 是孵化器。经纪人获得媒体培训、个人 IP 打造、真实客源,以及把生意做大的工具——而不只是一张办公桌。",
    },
    {
      title: "靠 AI 与数据，而非凭感觉",
      body: "定价、营销与客户服务都由数据和 AI 加持——每个决策都比同行更快、更有据。",
    },
  ],
  featured: {
    eyebrow: "精选房源",
    title: "纽约精选好房",
    viewAll: "查看全部房源",
  },
  neighborhoods: {
    eyebrow: "本地洞察",
    title: "我们了如指掌的社区",
    lead: "定价与时机，来自真正走在这些街区里的人。以下是我们覆盖最深的几个片区。",
    exploreAll: "探索全部社区",
  },
  reach: {
    eyebrow: "我们的影响力",
    title: "我们不等头条，我们制造头条。",
    lead: "每一套房源都搭载着一台全网 100 万+ 粉丝的内容引擎——这是更快、更高成交背后的营销优势。",
  },
  testimonials: { eyebrow: "客户怎么说" },
  team: {
    eyebrow: "经纪团队",
    title: "成事背后的人",
    lead: "一支资深、双语的团队。你直接对接名字挂在门上的那位经纪人——绝不甩手转交。",
    cta: "认识经纪人",
  },
  contactBand: {
    eyebrow: "联系我们",
    title: "聊聊你的下一步。",
    lead: "买房、卖房，或只是还在考虑——先开始一次轻松的对话。没有压力，没有义务。",
  },
  inquiry: {
    name: "姓名",
    phone: "电话",
    email: "邮箱",
    message: "我们能帮你什么？",
    consent:
      "我同意 Homix 就我的咨询通过电话、短信或邮件与我联系。同意并非任何服务的前提。可能产生信息与流量费用；回复 STOP 可退订。",
    submit: "发送咨询",
    thanksTitle: "谢谢你。",
    thanksBody: "我们已收到你的留言，会尽快与你联系。",
  },
  about: {
    eyebrow: "关于 Homix",
    title: "一家媒体先行、AI 赋能的纽约房地产公司。",
    lead: "Homix 是一家以\"媒体先行\"为根基的纽约房地产公司：我们先赢得关注，再谈房源委托。我们组建了一支横跨法拉盛、皇后区与长岛的双语团队，并以 AI 辅助定价与营销——让您的房子用对的语言、在买家本就信任的平台上，触达真正合适的买家。",
    p1: "Homix 的起点是一台相机，而不是一块\"待售\"招牌。在公司成立之前，先有了观众——一群追随创始人张思（Si Zhang，\"Sunny\"）的街坊邻里，因为他用大家听得懂的语言，诚实地讲清楚纽约房地产到底是怎么运转的：合作公寓（co-op）董事会真正在意什么、为什么相邻两个街区价格相差悬殊、怎样读懂一则皇后区房源字里行间的言外之意。这种\"媒体先行\"的习惯，至今仍是我们存在的全部意义。我们相信，赢得客户最好的方式，是在任何人准备买卖之前就真正帮上忙，并在成交之后依然在场。",
    p2: "这样的起点，决定了我们做事的方式。我们的团队天生双语——英语与普通话皆能流利沟通，更通晓法拉盛、皇后区其他社区与长岛的真实生态：在这里，许多家庭正进行人生中第一笔、或最大一笔的美国置业。我们让 AI 在它该出力的地方出力：依据最新可比成交为房屋定价、用两种语言撰写营销文案、更快地为合适的房子匹配合适的买家。技术留在幕后，关系留在台前。无论您是初次置业，还是要出售养育了一家人的住所，您得到的，都是一支早已熟悉您社区的团队——以及一群早已在聆听的观众。",
    whatWeAreEyebrow: "我们是什么",
    whatWeAreTitle: "三位一体，一家公司。",
    whatWeAre: [
      {
        title: "一家持牌经纪公司",
        body: "我们是一家持牌的纽约住宅房地产经纪公司。挂牌、营销、成交，我们坚守经纪应有的本分——尽责守信、全程服务、遵循公平住房原则——区别只在于：在挂牌牌子立起之前，已经有一群观众在关注。",
      },
      {
        title: "一间内容工作室",
        body: "内容是我们做事的方式，而非事后的点缀。我们亲自拍摄、剪辑并发布社区漫步、市场解读与房源导览，由此积累起真实的本地粉丝——让每一套房源一上线就面对观众，而不是面对沉默。",
      },
      {
        title: "一个经纪人孵化器",
        body: "我们帮助经纪人打造个人品牌，而不只是积累客源。新加入的经纪人从第一天起就能用上我们的内容方法论、AI 工具与双语支持——这正是我们当初渴望拥有的平台——让他们的口碑不断累积，而非每成交一单就归零重来。",
      },
    ],
    howEyebrow: "我们的方式",
    workWithUs: "与我们合作",
    meetTeam: "认识团队",
    teamEyebrow: "我们的团队",
    teamTitle: "一个团队，服务纽约每个角落。",
    teamBody: "从法拉盛到曼哈顿，再到长岛北岸，我们的经纪人秉持同一套服务标准——本地洞察、双语贴心，以及每一单背后的媒体引擎。",
  },
  join: {
    eyebrow: "Homix 招募 · Flushing · NYC · LI",
    title: "我们给你的不是一张办公桌，而是一群观众。",
    lead: "大多数经纪公司卖给你一个 logo 和一份佣金分成，然后让你独自去找客户。Homix 不一样——我们是经纪公司、经纪人孵化器和媒体引擎三合一。入职第一天，你就接入抖音、小红书、Instagram 上超过 100 万的粉丝群体，拥有自有内容工作室、AI 与数据工具，以及在本地真正成交过的双语资深导师。Where Homes Meet Headlines——我们把经纪人打造成本地明星。",
    heroCta: "申请加入 Homix",
    stats: [
      {
        value: "1,000,000+",
        label: "抖音 · 小红书 · Instagram 全网粉丝，入职即可触达",
      },
      {
        value: "Bilingual",
        label: "中英双语团队，专为纽约华人买家与卖家而建",
      },
      {
        value: "In-house",
        label: "自有内容工作室——拍摄、剪辑、发布，无需外包",
      },
      {
        value: "Flushing · NYC · LI",
        label: "扎根法拉盛、皇后区与长岛，我们真正生活与成交的市场",
      },
    ],
    benefitsEyebrow: "为什么选择加入",
    benefitsTitle: "入职第一天，你就拥有。",
    benefits: [
      {
        title: "一群现成的观众，直接交到你手上",
        body: "你不必从零粉丝起步。我们在抖音、小红书、Instagram 上超过 100 万的社群，就是你的获客漏斗顶端。你的房源、你的出镜、你的故事，会推送给本就关注 Homix 的人群——让客户主动找到你，而不是你苦苦去找客户。",
      },
      {
        title: "自有工作室，把你打造成名",
        body: "这正是 SERHANT 的逻辑，并为本地市场量身定制：用媒体来卖房。我们的工作室为你撰稿、拍摄、剪辑短视频、房源影片和个人品牌内容——没有外包加价。你专注面对客户，我们负责让镜头爱上你。",
      },
      {
        title: "AI 与数据工具，帮你省下整周时间",
        body: "定价比对、社区数据、客户跟进、双语房源文案——全部交给我们的 AI 与数据系统处理，让你把时间花在客户身上，而不是表格里。好的科技应该服务于经纪人，而不是反过来。",
      },
      {
        title: "双语资深导师带教",
        body: "无论你是刚拿到执照，还是被困在只收桌费的公司，我们都会为你配对真正在法拉盛、皇后区和长岛成交过的资深经纪人——中英双语。真实跟单、真实复盘、真实人脉引荐。你学到的是市场，而不只是理论。",
      },
      {
        title: "为双语市场而生",
        body: "纽约的华人买家与卖家是一个庞大却被忽视的市场——而我们就是为他们、用两种语言打造的。营销、合同、沟通，都用每位客户最信任的语言进行，这意味着你能服务到其他经纪人根本触及不到的客户。",
      },
      {
        title: "一个真正的团队，而非桌费工厂",
        body: "有些经纪公司只是租给你一个座位、按月收费。Homix 选择投资你，因为你的成功就是我们的故事。透明的分成结构、清晰的成长路径，以及一个真正并肩作战的团队——我们宁愿打造一小批明星，也不要一仓库的名字。",
      },
    ],
    stepsEyebrow: "如何加入",
    stepsTitle: "从初次见面，到本地明星。",
    steps: [
      {
        title: "提交申请，进行一次真诚的面谈",
        body: "把你的背景告诉我们——已持照、刚持照，或正在考虑转行。我们会面对面（中英文皆可）了解你的目标，并坦诚地告诉你 Homix 是否适合你。",
      },
      {
        title: "打造你的品牌套装",
        body: "我们的工作室为你拍摄出镜内容、建立你的双语主页，并将你接入 Homix 各大渠道，让超过 100 万的观众开始看到你的名字和你的房源。",
      },
      {
        title: "配对导师，开通工具",
        body: "我们为你配对一位资深双语导师，并开通 AI、数据与 CRM 工具——随后你便开始跟进真实客户，身边有人支持，而不是丢给你一本手册自己啃。",
      },
      {
        title: "成长为本地明星",
        body: "随着你的成交与内容不断累积，我们持续放大你的曝光、品牌与收入。真正投入的经纪人，会成为整个社区一眼就认得的面孔。",
      },
    ],
    whoEyebrow: "我们在寻找谁",
    whoTitle: "我们在寻找这样的你",
    whoBody: "你不需要庞大的客户名单，也不需要现成的粉丝——你需要的是企图心，以及愿意出镜、愿意走进社区的态度。如果你是刚持照、想要一个真正的起飞平台而不只是一张桌子和一个登录账号，我们很合适；如果你是经验丰富、却被困在只收费的经纪公司、厌倦了所有客户都得自己一个人去找，我们同样合适。考虑到我们服务的客户群，双语（中英文）是很大的加分项，但不可妥协的是：渴望、可被指导的心态，以及正直。如果你想成为本地明星，并且愿意为之付出，我们想和你聊聊。",
    faqEyebrow: "常见问题",
    faqTitle: "你可能想了解。",
    faq: [
      {
        q: "我还没有执照，可以加入吗？",
        a: "欢迎尽早联系我们。我们无法为你颁发执照——那是州里的事——但我们会指引你报读正确的考照课程，而且我们本就是为帮助新持照经纪人起步而设计的。导师、工具与观众，恰恰在你刚起步时最有价值。",
      },
      {
        q: "佣金分成和收入结构是怎样的？",
        a: "我们坚持透明的收入结构，并会在首次面谈时与你开诚布公地讨论，因为最合适的方案取决于你的经验和目标。我们绝不会把每月的桌费包装成所谓的“合伙”。我们投资你的品牌与客户，因为你的成长就是我们的成长方式。",
      },
      {
        q: "我需要先有粉丝才能用上媒体引擎吗？",
        a: "不需要——这正是关键所在。你从第一天起就接入我们超过 100 万的观众和自有工作室。我们从你当下的起点出发，帮你打造个人品牌；你不必带着名气进来，而是带着名气走出去。",
      },
      {
        q: "在这里工作必须会中文吗？",
        a: "会中文是很大的优势，因为我们大量客户是华人，团队本身也以中英双语运作。但这并非硬性要求——企图心、可指导性和正直更为重要。我们会把你安排在最能取胜的位置。",
      },
    ],
    ctaEyebrow: "聊一聊",
    ctaTitle: "别再独自追着客户跑。让自己成为头条。",
    ctaLead: "只需一次面谈，你就能看到一群观众、一个工作室、一套 AI 工具和真正的导师，能为你的事业带来什么。请在下方申请——我们会用你偏好的语言回复你。",
    orReach: "或直接联系我们：",
  },
  journal: {
    eyebrow: "观察",
    title: "来自一家 AI 优先经纪公司的洞察",
    lead: "市场数据、社区深度、值得一读的观点——出自真正做事的人。",
    readMore: "阅读全文",
    by: "作者",
    backToJournal: "全部文章",
    minRead: "分钟阅读",
  },
  offer: {
    eyebrow: "提交报价",
    title: "准备好出价了吗？",
    lead: "告诉我们房子和你的条件。每一份提交都会有 Homix 顾问审阅，并通常在一个工作日内跟进，帮你把报价正式化。",
    prepEyebrow: "开始之前",
    prepTitle: "请先准备好",
    prep: [
      {
        title: "房源",
        body: "你想出价的房子的地址或 MLS 编号。",
      },
      {
        title: "你的条件",
        body: "报价金额、付款方式（现金或贷款）、首付，以及你理想的过户日期。",
      },
      {
        title: "资金证明",
        body: "贷款预批信或资金证明会让你的报价更有分量——准备好一份 PDF 以便上传。",
      },
    ],
    formEyebrow: "报价详情",
    fallbackTitle: "在线报价正在接入中。",
    fallbackBody: "我们正在配置这项功能。在此之前，欢迎直接致电或留言，我们会当面为你接收报价。",
    talkToUs: "联系我们",
    disclaimer: "提交此表单是无约束力的意向表达，并非合同——具备法律约束力需另签正式合同。Homix 遵循《公平住房机会》原则。你提供的信息将依据我们的隐私政策处理。",
  },
  buyercoach: {
    eyebrow: "买家教练 · AI",
    title: "你的 AI 买房教练。",
    lead: "关于在美国买房的任何问题都可以问。基于 Homix 的指南训练，用大白话，随时为你解答。",
    disclaimer: "回答是由 AI 生成的一般信息——不构成法律、财务、税务或贷款方面的专业意见。重要事项请向持牌的 Homix 顾问核实。",
    fallbackTitle: "教练正在接入中。",
    fallbackBody: "我们的 AI 买房教练即将上线。在此之前，欢迎联系真人顾问，我们很乐意帮忙。",
    talkToAdvisor: "联系顾问",
  },
  toolDesc: {
    calculator: "估算你的月供",
    offer: "在线提交购房报价",
    buyercoach: "AI 买房问答",
    onboarding: "加入 Homix 的全流程",
  },
  buyMenu: [
    { title: "搜索房源", desc: "查找全部在售房源" },
    { title: "社区指南", desc: "我们覆盖区域的本地指南" },
    { title: "房贷计算器", desc: "估算你的月供" },
  ],
  onboarding: {
    eyebrow: "经纪人入职",
    title: "在 Homix 的前 90 天，为你铺好每一步",
    lead: "加入一家经纪公司，应当像加入一支早已为你扫清跑道的团队。这里是 Homix Realty 入职流程的完整图景——从你在法拉盛接受我们的 offer，到成交第一单。六个阶段，无需自己摸索：依据纽约州法律正确办妥执照与合规、配齐所有账户与系统、在自有摄影棚打造你的媒体素材包与个人品牌，并由一位中英双语导师全程陪你同行。",
    visionMission: {
      eyebrow: "Homix 愿景与使命",
      title: "打造纽约最以经纪人为核心的地产媒体公司。",
      lead: "Homix 的存在，是为了把平台、流量、系统与导师资源交到有野心的经纪人手上。我们把经纪业务的专业标准与现代媒体能力结合起来，让经纪人成长更快、服务更稳，并成为本地市场值得信任的声音。",
      items: [
        {
          title: "愿景",
          body: "成为一家让每一位认真投入的经纪人都能被看见、被信任、被市场记住的经纪公司。",
        },
        {
          title: "使命",
          body: "用双语服务、合规运营、AI 工具与媒体引擎，帮助经纪人把专业能力转化为真实机会。",
        },
      ],
    },
    leadership: {
      eyebrow: "领导团队",
      title: "由真正做过业绩、做过团队、做过内容的人带队。",
      lead: "加入 Homix，你不是只拿到一个品牌名，而是进入一个由实战型领导者搭建的平台：地产成交、媒体流量与带教体系在同一个屋檐下运转。",
      people: [
        {
          name: "Si Zhang (Sunny)",
          role: "创始人 · 持牌地产经纪",
          image: "/onboarding/sunny-zhang.jpg",
          bio: "Sunny 于 2013 年进入房地产行业，曾在中国头部房企取得全国级销售成绩，来到美国后迅速转入纽约地产市场并成为高产经纪人。创立 Homix 之前，他打造了超过 40 万粉丝的个人媒体社区，证明了可信内容可以为经纪人和卖家带来真实的市场杠杆。",
          focus: ["公司战略", "媒体引擎", "经纪人个人品牌"],
        },
        {
          name: "Heidi Liu",
          role: "联合创始人 · 持牌地产副经纪",
          image: "/onboarding/heidi-liu.jpg",
          bio: "Heidi 拥有 13 年以上纽约地产全职经验，曾担任 broker、branch manager、coach 与 mentor，同时也是投资人与业主。她以市场判断、持续跟进、空间审美、营销能力和长期 Top Producer 记录著称，帮助经纪人学会一笔干净交易背后的服务标准。",
          focus: ["导师带教", "交易标准", "客户体验"],
        },
      ],
    },
    adminTeam: {
      eyebrow: "内部行政团队",
      title: "你第一批交易背后的支持台。",
      lead: "入职不是只看几支视频。办公室、营销与财务有人协同，才能让新经纪人真正把精力放在学习市场和服务客户上。",
      members: [
        {
          name: "Grace Xia",
          role: "办公室经理",
          image: "/onboarding/grace.jpg",
          imagePosition: "50% 35%",
          body: "负责办公室协调、入职清单、账号开通、日程安排、文件流转，以及把问题及时交到对的人手上。",
        },
        {
          name: "Zoey Zhang",
          role: "市场协调",
          image: "/onboarding/zoey.jpg",
          imagePosition: "50% 22%",
          body: "支持经纪人主页、内容日历、房源营销需求、社交媒体协调，以及确保每位经纪人的对外形象保持品牌一致。",
        },
        {
          name: "Henry Ju",
          role: "会计 / 财务",
          image: "/onboarding/henry-ju.jpg",
          imagePosition: "50% 26%",
          body: "协助佣金、报销、发票、交易相关款项与财务问题，确保记录清楚、跟进及时。",
        },
      ],
    },
    adminChecklist: {
      eyebrow: "内部行政入职清单",
      title: "内部行政入职清单，确保每位新经纪人顺利推进。",
      lead: "这是一份办公室端使用的 tracker。每一项都有负责人、交接节点和明确目的，确保经纪人在开始跟进线索前，执照、系统、品牌和支持路径都已经准备好。",
      groups: [
        {
          title: "文件与执照档案",
          owner: "办公室经理",
          items: [
            "签署 Independent Contractor Agreement，并记录佣金档位。",
            "完成 W-9、direct deposit、紧急联系人与内部档案建立。",
            "确认 eAccessNY 中的执照转挂靠或 sponsorship 步骤。",
          ],
        },
        {
          title: "系统权限",
          owner: "办公室经理 + 运营",
          items: [
            "开通 @homix 邮箱、agent portal、CRM、AI workspace 与 shared drive 权限。",
            "跟进 OneKey MLS onboarding 状态，并安排 MLS rules orientation。",
            "开通交易工具、电子签名权限，并收藏合规表单库。",
            "发送个人网站编辑链接，并确认可正常使用。",
          ],
        },
        {
          title: "品牌与营销",
          owner: "市场协调",
          items: [
            "经纪人 bio 改写、必要时翻译，并确认官网版本。",
            "准备名片、邮件签名、微信头像制作、社交账号 bio、执照信息与平等住房机会声明。",
            "准备 For Sale sign、Open House sign、riders、二维码与首个房源可用的印刷模板。",
          ],
        },
        {
          title: "培训与导师交接",
          owner: "领导团队 + 导师",
          items: [
            "分配培训视频路径：基础课程、买卖双方流程、合规与媒体课程。",
            "安排跟随资深经纪人观摩实战、话术演练与第一次客户咨询复盘。",
            "明确第一单支持路径：报价条款、文件与时间线由谁复核。",
          ],
        },
        {
          title: "财务设置",
          owner: "会计 / 财务",
          items: [
            "录入佣金分成、付款方式与交易财务备注。",
            "说明 invoice、报销与 referral fee 流程。",
            "确认经纪人了解 commission release 前财务需要哪些文件。",
            "告知财务联系人与问题升级路径。",
          ],
        },
      ],
    },
    socialMedia: {
      eyebrow: "HOMIX social media",
      title: "经纪人可以在公司媒体体系里成长。",
      lead: "Homix 不只是一个 brokerage 品牌，也是一个由公司账号、经纪人 IP、双语内容和房源故事组成的媒体网络。我们希望经纪人在第一次客户来电之前，就已经被市场看见、记住并信任。",
      image: {
        src: "/onboarding/homix-social-media-team.jpg",
        alt: "Homix social media IP 团队大合照",
      },
      stats: [
        { value: "1M+", label: "全平台受众基础" },
        { value: "EN / 中文", label: "双语内容体系" },
        { value: "IP", label: "经纪人个人品牌孵化" },
      ],
      pillars: [
        {
          title: "公司号曝光",
          body: "当选题、节奏和拍摄计划合适时，经纪人可以安排出镜 Homix 公司号。",
        },
        {
          title: "个人 IP 规划",
          body: "我们帮助经纪人把本地知识、语言优势和客户故事整理成可持续更新的内容方向。",
        },
        {
          title: "房源内容放大",
          body: "房源可以被转化成短视频导览、社区故事、open house 推广和中英双语文案。",
        },
        {
          title: "从拍摄到发布",
          body: "媒体团队会衔接形象照、脚本、拍摄、剪辑和发布节奏，让内容持续稳定。",
        },
      ],
      channelsTitle: "Homix 官方社媒账号",
      channels: [
        {
          key: "douyin",
          name: "Douyin / 抖音",
          handle: "@Homix 合美置地",
          body: "抖音号：70077200788。可点击链接打开，也可以保存二维码后在抖音扫码关注。",
          url: "https://v.douyin.com/EPHD2ERjt3A/",
          image: "/onboarding/homix-douyin-qr.jpg",
          alt: "Homix 抖音二维码",
          width: 545,
          height: 545,
        },
        {
          key: "red",
          name: "RED / 小红书",
          handle: "homix合美置地｜乐居",
          body: "关注 Homix 小红书，查看纽约地产视频、本地市场内容与经纪人 IP 内容。",
          url: "https://xhslink.com/m/2vk0nSDkvyq",
          image: "/onboarding/homix-xiaohongshu-qr-clean.jpg",
          alt: "Homix 小红书二维码",
          width: 306,
          height: 306,
        },
        {
          key: "instagram",
          name: "Instagram",
          handle: "@homix.realty",
          body: "关注 Homix Realty Instagram，查看房源视觉、经纪人媒体内容、活动与品牌动态。",
          url: "https://www.instagram.com/homix.realty?igsh=cWlwZm83aTA5b3h5&utm_source=qr",
          image: "/onboarding/homix-instagram-qr.jpg",
          alt: "Homix Instagram 二维码",
          width: 410,
          height: 410,
        },
        {
          key: "wechat-channels",
          name: "WeChat Channels / 视频号",
          handle: "Homix 合美置地",
          body: "使用微信扫描二维码，关注 Homix 视频号。",
          image: "/onboarding/homix-wechat-channels-qr.jpg",
          alt: "Homix 视频号二维码",
          width: 530,
          height: 530,
        },
      ],
    },
    resources: {
      eyebrow: "Homix 如何帮助你",
      title: "真正能用起来的入职资源。",
      lead: "从第一次登录系统到第一笔成交，Homix 给你的不是一叠文件，而是一套可以直接开始工作的工具箱。",
      detailComingTitle: "详细指南即将上线",
      detailComingBody: "我们正在整理这项资源的完整说明。在此之前，欢迎联系我们，办公室团队会直接为你提供协助。",
      items: [
        {
          slug: "brokerage-operations",
          title: "经纪公司运营支持",
          body: "执照挂靠步骤、合规提醒、E&O 指引、表单、披露标准，以及遇到敏感问题时清晰的升级路径。",
        },
        {
          slug: "eo-directives",
          title: "E&O / EO 指令",
          body: "明确 E&O 保障、Equal Opportunity / Fair Housing 表达、广告审核，以及何时必须暂停并升级给 broker review。",
        },
        {
          slug: "marketing-media",
          title: "营销与媒体支持",
          body: "经纪人主页、形象照、自我介绍短片、房源内容、中英双语文案、社交模板，以及把社区知识变成内容的协助。",
        },
        {
          slug: "self-branding",
          title: "个人品牌流程",
          body: "名片、邮件签名设置、Open House 和 For Sale sign 设计、Homix 域名入口、welcome/birthday/listing flyer，以及可选私人定制媒体 package，由 marketing 协同完成。",
        },
        {
          slug: "training-library",
          title: "培训视频库",
          body: "基础课程、买卖双方流程、媒体课程、合规复习，以及可直接用于咨询、报价与跟进的实战话术。",
        },
        {
          slug: "mentorship-deal-support",
          title: "导师与交易支持",
          body: "跟随资深经纪人观摩实战、话术演练、首次客户电话复盘、listing presentation 准备、交易时间线支持，以及成交后的复盘。",
        },
      ],
      mentorshipDealSupportDetail: {
        eyebrow: "导师与交易支持",
        title: "开始所需的一切。",
        lead: "从第一天起，你就与资深经纪人结对，并接入一套帮助你学得更快、更有信心、成交更多的系统。",
        items: [
          {
            title: "AI 工具与系统",
            body: "使用前沿的 AI 工具，简化营销、内容创作、客户线索管理与客户沟通。",
          },
          {
            title: "社媒成长",
            body: "学习如何打造个人品牌，并借助源自 Sunny 全平台 30 万+ 粉丝沉淀出的社媒策略，把流量转化为生意。",
          },
          {
            title: "一对一带教",
            body: "与资深经纪人紧密合作——跟岗观摩、角色扮演、话术演练，以及真实成交复盘。",
          },
          {
            title: "交易支持",
            body: "从合同到过户全程指导，让每一笔交易都成为一次有价值的学习。",
          },
          {
            title: "销售与业务拓展",
            body: "掌握线索开发、Listing Presentation、买家咨询、谈判技巧与业务规划，加速你的成长。",
          },
        ],
        closing: "我们的目标很简单：帮助经纪人学得更快、更有信心、成交更多。",
      },
      eoDirectivesDetail: {
        eyebrow: "E&O / EO 指令",
        title: "开始面对客户前，必须先确认的合规指令。",
        lead: "这个资源集中说明 E&O 保险、Equal Opportunity / Fair Housing 表达、广告审核，以及哪些情况必须暂停并升级给 broker review。",
        items: [
          {
            title: "先确认 E&O 保障",
            body: "这是公司和经纪人在专业服务中，如果因为错误、遗漏、疏忽、文件处理、沟通误解、披露不足等引发客户投诉或索赔时，可能会启动的保险机制。",
            items: [
              "记录 E&O 保险、公平住房确认、政策手册签收。",
              "它不是“万能免责卡”，也不代表经纪人可以自己承认责任或私下解决。",
              "客户说“我要投诉你 / sue you / report you”时，当天通知 broker / office。",
              "收到律师信、demand letter、法院文件、DOS / MLS / board complaint，或客户要求赔钱、退佣金、补偿损失时，当天上报。",
              "不要私自承认“是我的错”，不要承诺赔钱、退佣金、补偿，也不要删除短信、微信、邮件、录音、文件。",
            ],
          },
          {
            title: "Equal Opportunity 表达",
            body: "所有对外触点都必须符合公平住房与平等机会原则。",
            items: [
              "在需要的位置使用 Equal Housing Opportunity 语言、标识和披露。",
              "不得基于受保护类别进行引导、筛选、劝退或描述客户/社区。",
              "涉及社区、学校、安全或人口结构时，只使用事实和可核实来源。",
              "客户指控歧视、误导、隐瞒、利益冲突、双重代理没讲清楚时，当天通知 broker / office。",
              "不要把问题发到群里讨论客户隐私。",
            ],
          },
          {
            title: "广告与媒体审核",
            body: "房源、社交内容、flyer、sign 和经纪人主页都必须准确、持牌、符合品牌标准。",
            items: [
              "发布前确认 brokerage 名称、经纪人 title、执照信息和联系方式。",
              "使用已批准的图片、价格、房源状态、卖点表述和 listing attribution。",
              "敏感 caption、保证性说法、客户评价或对比性宣传，先交给公司复核。",
              "房源信息、价格、面积、税费、学区、HOA、co-op / condo 信息可能说错时，当天通知 broker / office。",
            ],
          },
          {
            title: "暂停并询问原则",
            body: "只要情况涉及法律、歧视、隐私或财务敏感问题，先暂停，不要直接回复客户。",
            items: [
              "合同、offer、agency disclosure、lead paint、Fair Housing、commission agreement 等关键文件可能漏签或签错时，当天上报。",
              "交易快出问题：deposit、closing date、contingency、mortgage commitment、inspection、walkthrough 产生重大争议时，当天上报。",
              "不要和客户争吵或长篇解释责任归属；不要私下回复律师信、投诉信、监管机构邮件；不要事后补文件、改日期、改聊天记录。",
              "统一回复：“我理解你的担心。这个问题我会马上提交给公司 broker / office 做正式 review。为了确保信息准确，我先不在这里判断责任或作出承诺，我们会尽快由公司统一回复。”",
            ],
          },
        ],
        note: "不确定时先停下来问。Broker review 是流程的一部分，不是最后补救。",
      },
      marketingMediaDetail: {
        eyebrow: "营销与媒体支持",
        title: "从主页搭建到可发布内容，帮经纪人真正被看见。",
        lead: "这一部分会把新经纪人的对外形象搭起来：主页润色、社交账号设置、形象照、自我介绍短片、房源内容、中英双语文案，以及可以持续执行的内容节奏。",
        workflowTitle: "媒体启动路径",
        workflows: [
          {
            title: "主页与形象基础",
            body: "先整理经纪人 bio、形象照、联系方式、语言优势、服务区域和合规 brokerage identity。",
            items: [
              "确认对外显示姓名、英文名和 title。",
              "准备官网 profile 与社交媒体 bio 文案。",
              "统一头像、banner、邮件签名和名片信息。",
            ],
          },
          {
            title: "Social media setup",
            body: "每个平台都要有明确用途，不只是开账号。我们会围绕信任、本地专业、房源曝光和客户跟进来设置。",
            items: [
              "创建或优化 Google Business、Instagram、Facebook Business Page、LinkedIn、TikTok 和小红书。",
              "补齐合规联系方式、公司身份和主页视觉。",
              "准备第一版 bio、精选集、置顶内容和中英双语文案方向。",
            ],
          },
          {
            title: "内容生产节奏",
            body: "媒体团队帮助经纪人把真实专业能力转化为可重复生产的内容，而不是偶尔发一条。",
            items: [
              "规划自我介绍视频、社区内容、房源导览和教育型选题。",
              "选题成熟后，协调棚拍或外景拍摄。",
              "发布前检查 caption、披露信息和更新节奏。",
            ],
          },
        ],
        socialTitle: "社交媒体账号搭建",
        socialLead: "以下是 Homix 在 onboarding 期间会协助经纪人搭建或优化的平台基础。",
        supportTitle: "Marketing 可以协助的内容",
        supportItems: [
          "主页文案、双语 bio 和经纪人定位。",
          "形象照、自我介绍短片、房源视频和 open house clips。",
          "Welcome、birthday、just listed、UC 和 closed flyer 模板。",
          "符合选题规划时，安排出镜公司号。",
          "Caption review、合规检查和内容日历规划。",
        ],
      },
      brokerageOperationsDetail: {
        eyebrow: "Brokerage operations",
        title: "表格、系统、交易支持，集中放在一个运营中心。",
        lead: "这个页面用于帮助经纪人快速找到正确表格，确认哪些 documents 需要交给公司，并了解 Homix 在 onboarding 和实际做单中会用到的不同系统。",
        masterSheetLabel: "打开完整 forms 表格",
        masterSheetUrl: brokerageFormsSheetUrl,
        workflowTitle: "Operations 如何支持每一单",
        workflows: [
          {
            title: "填写文件前",
            body: "先确认交易类型、代理关系、房产类型和客户身份，再选择对应表格。",
            items: [
              "情况特殊或敏感时，先问 operations 再发给客户。",
              "使用最新 master sheet，不使用旧下载版本。",
              "确认当前需要的是空白表格、样本，还是已签版本。",
            ],
          },
          {
            title: "交易进行中",
            body: "签字、披露、deal sheet、状态更新都要清楚完整，方便 broker review 和办公室跟进。",
            items: [
              "签好文件后尽快上传或交给办公室。",
              "文件进入 closing 前先检查 disclosure 是否缺漏。",
              "交易备注要让 admin、accounting 和 broker review 都能看懂。",
            ],
          },
          {
            title: "佣金发放前",
            body: "Accounting 需要完整 closing documents、commission paperwork 和 check 信息，才能处理 payout。",
            items: [
              "及时提交 commission report 和需要的 check。",
              "确认 referral、co-broke 或 rental commission agreement。",
              "佣金分成、invoice 或付款问题直接升级给 accounting。",
            ],
          },
        ],
        toolsTitle: "经纪人会用到的 Tools & Systems",
        toolsLead: "Admin 会根据经纪人的角色和业务需要开通对应系统。账号密码请自行保管；在新系统录入客户或交易资料前，先确认该系统适用场景。",
        tools: [
          {
            name: "Kevv",
            body: "用于公司指定 brokerage workflow、记录和经纪人任务的内部运营系统，具体权限由 operations 开通。",
          },
          {
            name: "Keystory",
            body: "用于 listing 与 property story 支持，帮助整理房源信息、房屋卖点和给客户看的 presentation material。",
          },
          {
            name: "Rescript",
            body: "用于文案和话术支持，可协助整理合规客户沟通、listing copy、follow-up 模板和出镜脚本要点。",
          },
          {
            name: "Google Drive forms library",
            body: "Homix forms 的实时来源，包含空白模板、sample documents 和需要交公司的 documents checklist。",
          },
          {
            name: "Transaction & e-signature tools",
            body: "用于签字、disclosure、文件流转和 broker review，适用于需要正式签署的交易文件。",
          },
          {
            name: "MLS / listing systems",
            body: "用于 listing data、status change、required fields 和必须与签署文件一致的房源信息。",
          },
        ],
        formsTitle: "Forms library",
        formsLead: "以下表格来自 Homix 共享 forms sheet。Blank 是空白表格，Sample 是填写参考；如需修改固定条款或披露语言，请先跟 operations 确认。如果 Google Drive 跳出权限提示，请使用公司授权的 Google 账号登录，或联系 admin 开通权限。",
        blankLabel: "空白表格",
        sampleLabel: "Sample",
        formGroups: brokerageFormGroups,
        submissionTitle: "需要交给公司的 Documents",
        submissionLead: "以下 checklist 可用于 new listing、pending、closing 和 rental 节点，帮助经纪人提前准备完整文件。",
        submissionGroups: brokerageSubmissionGroups,
      },
      socialPlatformsTitle: "社交媒体账号搭建",
      socialPlatforms: [
        {
          key: "google",
          name: "Google Business",
          body: "商家主页、服务区域、照片、评价链接与合规联系方式设置。",
        },
        {
          key: "instagram",
          name: "Instagram",
          body: "专业 bio、精选集、房源 reels、本地内容节奏与 Homix 品牌统一。",
        },
        {
          key: "facebook",
          name: "Facebook Business Page",
          body: "商业主页基础设置、头像与封面、联系按钮、帖子与 open house 推广。",
        },
        {
          key: "linkedin",
          name: "LinkedIn",
          body: "专业标题、公司身份、可信履历文案，以及适合客户阅读的市场更新。",
        },
        {
          key: "tiktok",
          name: "TikTok",
          body: "短视频账号定位、社区内容 hook、合规房源文案与更新节奏。",
        },
        {
          key: "red",
          name: "RED / 小红书",
          body: "中文主页搭建、本地生活内容、买家教育笔记与房源故事化表达。",
        },
      ],
      selfBrandingDetail: {
        eyebrow: "Self branding procedure",
        title: "每位经纪人上手前，都要先拥有专业统一的个人品牌形象。",
        lead: "Homix 会为经纪人提供基础品牌物料、邮件签名建议、常用 flyer 模板、Homix 域名入口，以及可选的私人定制 package。目的很简单：让客户第一次看到你，就感到专业、可信、完整。",
        stepsTitle: "公司提供的个人品牌物料",
        steps: [
          {
            title: "名片设计",
            body: "公司提供 Homix 品牌名片设计，包含经纪人姓名、英文名、title、电话、邮箱、办公室地址、执照披露、二维码和社交媒体信息。",
            items: [
              "经纪人确认姓名、title、电话、邮箱、执照信息和常用社交账号。",
              "Marketing 团队制作 proof，并在印刷前交由经纪人确认。",
              "所有名片保持 Homix 品牌一致，让经纪人对外形象更统一。",
            ],
            examples: [
              {
                title: "Homix 名片",
                body: "Homix 品牌名片模板，含经纪人姓名、执照披露、联系方式、二维码和照片区域。",
                image: "/onboarding/self-branding-business-card.png",
                alt: "Homix 经纪人入职品牌名片模板",
                width: 1044,
                height: 600,
              },
            ],
          },
          {
            title: "邮件签名设置",
            body: "我们建议每位经纪人在邮件 setting 里填写自己的专业后缀，让客户收到邮件时第一眼就知道你的身份、联系方式和公司信息。",
            items: [
              "姓名、职位、direct number、Homix Realty 电话与办公室地址。",
              "需要时加入 license、公平住房和平等机会相关披露。",
              "格式保持干净，适配 Gmail、手机邮箱和电脑端邮箱。",
            ],
            examples: [
              {
                title: "邮件签名设置",
                body: "建议每位经纪人按统一格式设置邮件签名，提升客户沟通的专业感。",
                image: "/onboarding/self-branding-email-signature.svg",
                alt: "Homix 经纪人邮件签名设置示例",
                width: 1600,
                height: 720,
              },
            ],
          },
          {
            title: "Open House & For Sale sign",
            body: "公司提供 Open House 和 For Sale sign 的设计，可加入经纪人头像、联系方式、二维码、房源 flyer 区域和必要披露。",
            items: [
              "Open House sign 预留头像位置和 A4 flyer 展示区域。",
              "For Sale sign 包含经纪人资料、联系方式、二维码和社交媒体图标。",
              "Marketing 会检查视觉清晰度、信息完整度和合规披露。",
            ],
            examples: [
              {
                title: "Open House sign",
                body: "公司提供的 Open House sign 设计，预留头像与 flyer 展示位置。",
                image: "/onboarding/self-branding-open-house-sign.jpg",
                alt: "Homix Open House sign 设计模板",
                width: 1600,
                height: 980,
              },
              {
                title: "For Sale sign",
                body: "公司提供的 For Sale sign 设计，包含经纪人联系方式与二维码位置。",
                image: "/onboarding/self-branding-for-sale-sign.jpg",
                alt: "Homix For Sale sign 设计模板",
                width: 1600,
                height: 982,
              },
              {
                title: "For Sale sign（竖版）",
                body: "竖版 For Sale sign 设计，含经纪人姓名、二维码、照片区域和社交媒体图标。",
                image: "/onboarding/self-branding-for-sale-sign-vertical.jpg",
                alt: "Homix 竖版 For Sale sign 设计模板",
                width: 732,
                height: 1106,
              },
            ],
          },
          {
            title: "常用 flyer 模板",
            body: "公司提供常用节点的 flyer 模板，帮助经纪人保持曝光，不需要每次从零开始设计。",
            items: [
              "Welcome flyer 和 birthday flyer。",
              "Just Listed、Under Contract / UC 和 Closed flyer。",
              "Marketing 可协助导出适合社交媒体和打印使用的版本。",
            ],
          },
          {
            title: "Homix 域名与私人定制 package",
            body: "经纪人可以通过 Homix 域名入口建立更专业的客户链接，也可以选择私人定制 package 做更完整的个人品牌内容。",
            items: [
              "Homix 域名/个人主页入口，让客户更容易记住和打开。",
              "私人定制 package 可包含个人主页润色、社交模板、短视频策划和房源营销物料。",
              "符合公司内容规划的经纪人，也可以安排出镜 Homix 公司号。",
            ],
          },
        ],
        signatureTitle: "建议填写的邮件后缀字段",
        signatureLines: [
          "姓名",
          "Licensed Real Estate Salesperson",
          "Direct: 个人电话",
          "Homix Realty",
          "Tel: (929) 666-9886",
          "37-20 Prince St, Suite 3H, Flushing, NY 11354",
        ],
        flyerTitle: "可提供的 flyer 类型",
        flyerTypes: [
          "Welcome flyer",
          "Birthday flyer",
          "Just Listed flyer",
          "Under Contract / UC flyer",
          "Closed flyer",
        ],
        packageTitle: "私人定制 package",
        packageBody: "如果经纪人想进一步打造个人品牌，Homix 可以协助定制个人主页、社交媒体模板、短视频内容计划、房源营销物料，并在合适选题下安排出镜公司号。",
      },
    },
    phases: [
      {
        title: "第一阶段 · Offer 与签约文件",
        blurb: "我们从把话说清楚开始。在配置任何系统或办理执照之前，你与 Homix 先把合作关系白纸黑字写下来——你的佣金档位、公司提供什么、彼此的期待是什么。这些大多在法拉盛办公室一次面谈中、用你最自在的语言完成。",
        items: [
          "审阅并签署《独立承包人协议》，其中界定你的佣金分成、档位，以及分成如何随业绩成长。",
          "通读 Homix 政策手册与行为准则——广告规则、客户对接、反歧视与公平住房（Fair Housing）要求。",
          "完成税务与发放设置：W-9 表、直接存款资料，并登记紧急联系人。",
          "认识你的入职负责人，并选定中英双语导师路线。",
          "领取你的入职路线图——这份六阶段计划，并为每个里程碑标注目标日期。",
        ],
      },
      {
        title: "第二阶段 · 执照与合规",
        blurb: "房地产是受执照监管的行业，在纽约州尤为严格。Homix 成为你的挂靠经纪（sponsoring broker）——但销售员执照属于你本人，以你的名义通过纽约州务厅（NY Department of State）申请。我们确保每一步第一次就办对，因为一份干净的执照档案，是后续一切的根基。",
        items: [
          "确认你已完成纽约州 77 小时执照前课程并通过州考（若已持有有效执照，则办理挂靠转移）。",
          "通过 eAccessNY 申请销售员执照，填入 Homix Realty Inc. 的经纪 UID 作为挂靠经纪；我们从公司端确认关联。",
          "领取州务厅 pocket card 与执照号——该号码须出现在你所有广告与房源中。",
          "纳入 Homix 的错误与遗漏（E&O）责任保险，并了解你的保障范围。",
          "完成必修的公平住房与职业道德规范（Code of Ethics）培训，确保起步即合规。",
        ],
      },
      {
        title: "第三阶段 · 系统与账户",
        blurb: "执照生效后，我们为你开启全套工具。Homix 给你一个统一的 Homix ID，打通邮箱、CRM、OneKey MLS，以及我们的 AI 工作台——正是驱动我们房源、估价与内容的同一套智能。到本阶段结束，你只需登录一次，就能触达推进一单交易所需的全部工具。",
        items: [
          "激活你的 @homix 企业邮箱与 Homix ID 单点登录，进入经纪人后台。",
          "通过公司协会会员资格获得 OneKey MLS 权限——覆盖皇后区及整个纽约都会区——并完成必修的 MLS 规则培训。",
          "配置你的 CRM：导入联系人、接通线索分配，了解 Homix 提供的线索如何进入你的管道。",
          "接入 Homix AI 工作台——房源文案、估价、中英互译与内容初稿。",
          "安装交易管理与电子签名工具，并收藏公司合规表单库。",
        ],
      },
      {
        title: "第四阶段 · 品牌与媒体素材包",
        blurb: "这是 Homix 与众不同之处。多数经纪公司只给你一个 logo，然后祝你好运。我们把你请到镜头前。我们的自有摄影棚与百万级（1M+）受众，就是为了让你从第一天起就被看见——市场遇见的是一位 Homix 专业人士，而非一个无名的新人。本阶段，把你打造成可被识别、契合品牌的媒体形象。",
        items: [
          "预约自有摄影棚拍摄：专业形象照、一段简短自我介绍影片，以及契合品牌的个人照片。",
          "发布经纪人主页：确认 bio、联系方式、执照披露，并关联到你的房源。",
          "完成品牌基础：名片 proof、合规邮件签名、社交账号名称，以及统一的中英双语主页文案。",
          "准备首批营销物料：For Sale 与 Open House sign、二维码、常用 flyer 模板，并和媒体团队定下第一组选题计划。",
        ],
      },
      {
        title: "第五阶段 · 培训与师徒同行",
        blurb: "工具与品牌成交不了单——本事才行。Homix 首先是一个经纪人孵化器，所以我们不会把你直接丢进深水区。你将获得一套结构化课程，以及一位在本地市场真正实战过的双语导师。在你真正上手之前，你会先学会一单 Homix 交易究竟如何运转——从第一通电话到成交桌。",
        items: [
          "完成 Homix 基础课程：定价、买卖方咨询、合同与谈判。",
          "跟随导师实地参与真实约访与一场成交，并在每次结束后共同复盘。",
          "用中英双语演练买方咨询与房源推介的话术剧本。",
          "制定你的 90 天业务计划：线索来源、内容节奏与每周行动目标。",
          "在客户场景中演练合规判断——代理关系披露时间点、公平住房表达、房源署名，以及何时升级给 broker review。",
        ],
        showVisualsOnOnboarding: false,
        visuals: [
          {
            title: "Buyer Boot Camp",
            subtitle: "买家精英实战营 · 6 weeks · 12 sessions",
            image: "/training/buyer-bootcamp.jpg",
            alt: "Buyer Boot Camp 买家精英实战营培训海报",
            width: 1280,
            height: 2134,
          },
          {
            title: "The Listing Mastery Bootcamp",
            subtitle: "6 周系统训练营 · 6 weeks · 12 sessions",
            image: "/training/listing-bootcamp.jpg",
            alt: "The Listing Mastery Bootcamp 培训海报",
            width: 1080,
            height: 1920,
          },
          {
            title: "纽约地产交易常见问题",
            subtitle: "陈恒律师 · 2026 年 4 月 15 日 · 12 PM",
            image: "/training/ny-transaction-pitfalls.jpg",
            alt: "Homix 纽约地产交易常见问题讲座 flyer",
            width: 1131,
            height: 1600,
          },
          {
            title: "房贷过程注意事项",
            subtitle: "Jing Rao mortgage team · 2 月 13 日",
            image: "/training/mortgage-process-notes.jpg",
            alt: "Homix 房贷流程与风险提示讲座 flyer",
            width: 1079,
            height: 1600,
          },
          {
            title: "自媒体变现与 AI 运用",
            subtitle: "Sunny Zhang & Eric Wei · 2026 年 1 月 22 日",
            image: "/training/ai-media-event.jpg",
            alt: "Homix 自媒体变现与 AI 运用公开课 flyer",
            width: 900,
            height: 1600,
          },
          {
            title: "Listing Appointment Week 3",
            subtitle: "Judy Markowitz · 4 月 8 日 · 1 PM",
            image: "/training/listing-appointment-week3.jpg",
            alt: "Homix 6 周系统训练营 Week 3 listing appointment flyer",
            width: 898,
            height: 1600,
          },
          {
            title: "贷款如何帮助经纪人成单",
            subtitle: "David Wu · 4 月 10 日 · 11 AM",
            image: "/training/loan-seminar-david-wu.jpg",
            alt: "Homix 贷款如何帮助地产经纪人成单讲座 flyer",
            width: 1280,
            height: 1600,
          },
          {
            title: "不查收入贷款 Week 4",
            subtitle: "Li Li · 4 月 13 日 · 11 AM",
            image: "/training/no-income-loan-week4.jpg",
            alt: "Homix 不查收入贷款项目类别和优势 Week 4 flyer",
            width: 899,
            height: 1600,
          },
          {
            title: "线下实战课现场",
            subtitle: "话术、答疑与交易演练",
            image: "/training/live-workshop.jpg",
            alt: "Homix 经纪人在线下 workshop 中学习话术与交易流程",
            width: 908,
            height: 1600,
          },
          {
            title: "班级合影",
            subtitle: "办公室培训与团队学习",
            image: "/training/training-team.jpg",
            alt: "Homix 团队成员在办公室培训期间合影",
            width: 1600,
            height: 1199,
          },
          {
            title: "办公室带教时刻",
            subtitle: "实战支持与阶段性 check-in",
            image: "/training/training-milestone.jpg",
            alt: "Homix 办公室培训后的带教与交流时刻",
            width: 1200,
            height: 1600,
          },
          {
            title: "会议室圆桌培训",
            subtitle: "办公室集体带教与讨论",
            image: "/training/roundtable-window-session.jpg",
            alt: "Homix 经纪人在会议室参加圆桌培训",
            width: 1199,
            height: 1600,
          },
        ],
      },
      {
        title: "第六阶段 · 第一单及之后",
        blurb: "入职在你的事业起点处收尾：一位真实客户、一笔真实交易，整家公司做你的后盾。在你把一单送过终点线时，导师、媒体引擎、AI 工具与运营台始终在你身边。成交之后，我们一起复盘哪些奏效，并定下能带你走向稳定、持续增长业务的节奏。",
        items: [
          "在关键决策点有导师支持，把你的第一条线索从接洽推进到签约。",
          "借助运营台完成合同审阅、时间节点把控，达成顺畅而合规的成交。",
          "把成功转化为内容：在 Homix 频道发布成交喜讯与客户故事。",
          "与导师进行首单复盘，并定下接下来 30 天的行动节奏。",
          "规划你晋升佣金档位、迈入 Homix 进阶与带队领导路线的路径。",
        ],
      },
    ],
    closingTitle: "入职路上，你从不孤单",
    closingBody: "这里的每一个阶段，都是 Homix 与你一起完成的，而非交出一张清单便不再过问。当你走完全程，你将拥有：由 Homix Realty 挂靠的有效纽约执照、完整的 OneKey MLS 权限、一整套技术与 AI 工具、在摄影棚打造并面向百万级受众的个人品牌，以及一位早已走过同一条路的导师。这正是\"找到一份工作\"与\"被托举着去赢\"之间的差别。欢迎加入 Homix。",
    clientGuides: {
      eyebrow: "客户指南 · 纽约 · OneKey MLS",
      title: "买家与卖家流程手册",
      lead: "基于纽约房地产法律与 OneKey MLS 标准整理的分步指南，可直接分享给客户，也可作为咨询时的参考。",
      buyerCta: "阅读买家指南",
      sellerCta: "阅读卖家指南",
    },
    buyerGuide: {
      eyebrow: "纽约买家购房全指南 · Homix Realty",
      title: "在纽约买房，完整流程详解",
      lead: "从评估预算到拿到钥匙，完整梳理纽约购房全流程。内容源自 Homix Realty 在皇后区、长岛及大纽约都会圈的真实成交经验，覆盖贷款融资、购房团队、Co-op 董事会，以及一路上的每一笔过户费用。",
      steps: [
        {
          title: "第一步 — 评估预算与了解纽约市场",
          body: "在开始看房之前，先对自身财务状况做全面梳理，并了解纽约三种产权形式的差异。清楚自己真正能承受多少、哪种房产类型适合你，是整个购房流程的基石。",
          items: [
            "预算经验法则：月供建议不超过税前收入的 28–36%。资金规划：首付 + 过户费用（约房价 2–5%）+ 装修预算 + 3–6 个月应急储备金。",
            "了解信用：FICO 评分 620+ 可申请常规贷款，740+ 可获更优利率。整理近 2 年 W-2、税表、银行流水与资产证明（自雇人士还需 2 年公司税表与 P&L 损益报告）。",
            "Co-op（合作公寓）：购买的是公司股份而非房产，价格较低，但需董事会审批，贷款比例通常不超过 80%。Condo（共管公寓）：拥有真实产权、限制较少，价格与过户费较高。House/联排：拥有土地产权，多见于外区，需承担房产税与维护费。",
            "按贷款类型的最低首付：常规贷款 3–20%（低于 20% 需 PMI 保险）、FHA 3.5%（信用分 580+）、VA 0%（军人）、Jumbo 10–20%+（超过 2025 年上限 $806,500）。Co-op 董事会通常要求首付 20–25%，部分高端楼盘要求 50%+，且许多不接受 FHA/VA 贷款。",
          ],
        },
        {
          title: "第二步 — 组建购房团队",
          body: "在纽约购房，一支专业的团队是成功的关键。在认真考虑任何房产之前，先把以下核心成员找好。",
          items: [
            "买方经纪人：代表买家利益，协助搜房、出价、谈判。选择持有纽约州执照、熟悉目标区域的经纪人（注意：2024 年后佣金规则有变化，请提前确认）。",
            "房产律师：纽约州法律要求买方须有律师代表，负责审查合同、处理产权、出席过户，费用通常 $2,000–$5,000。",
            "贷款经纪人/银行：帮助获得预批信并争取最优利率。建议同时联系 2–3 家贷款机构比较报价。",
            "房屋检查员（$300–$600）与产权公司：检查员检查房屋结构与系统；产权公司进行产权搜索并提供产权保险（通常由律师或银行推荐）。",
          ],
        },
        {
          title: "第三步 — 获得预批准信",
          body: "向银行或贷款经纪人提交收入、资产与信用文件，银行据此出具预批准信，说明你的可贷金额。在纽约市场，没有预批信，卖家不会认真对待你的报价。",
          items: [
            "向银行或贷款经纪人提交收入、资产、信用等文件。",
            "取得书面预批准信（Pre-Approval Letter），注明可贷金额。",
            "预批准信有效期通常为 60–90 天，过期需重新申请。",
            "Pre-Qualification（预审资格，非正式估算）与 Pre-Approval（正式批准，经核保承诺）不同——只有后者在竞争性报价中才有说服力。",
          ],
        },
        {
          title: "第四步 — 寻找心仪房产",
          body: "通过平台浏览房源，与经纪人明确需求，并实地看房。关注照片看不到的细节——采光、格局、楼盘管理状况，以及房产附带的各项规章。",
          items: [
            "通过 StreetEasy、Zillow、Realtor.com 及 OneKey MLS 浏览房源；向经纪人明确需求：房型、面积、楼层、学区。",
            "在开放日或私人带看时，关注采光、户型格局、周边环境与楼盘管理质量。",
            "Co-op 房产须遵循 House Rules（房屋规则）与 Proprietary Lease（专有租约），了解公寓规章与出租政策。",
            "查询房产的历史销售记录，以及管理费/共同费用（Maintenance / Common Charges）的变动情况。",
          ],
        },
        {
          title: "第五步 — 递交 Offer（报价）",
          body: "提交正式报价，包含价格、首付比例、贷款条款与预计交房日期。热门房源可能出现多份报价竞争（Bidding War）——在合同签署前，任何一方仍可退出。",
          items: [
            "书面报价载明价格、首付比例、贷款条款与预计过户日期。",
            "报价被接受后，双方进入合同协商阶段——此时任何一方均可退出。",
            "加入保障条款：房屋检查条款（Inspection Contingency）与贷款条款（Mortgage Contingency）。",
            "全现金、快速过户、灵活条款通常更受卖家青睐。",
          ],
        },
        {
          title: "第六步 — 签署买卖合同",
          body: "卖方律师起草合同，买方律师审查并谈判条款（通常需 1–2 周）。在纽约，具有法律约束力的是合同，而非被接受的报价。",
          items: [
            "签合同时支付定金（Earnest Money Deposit），通常为房价的 10%，存入律师托管账户（Escrow），过户前不得动用。",
            "合同应明确：价格、过户日期、包含物品（家电等）与各类附加条件条款。",
            "合同一旦签署即具法律效力——买家若无故退出，将损失全部定金。",
            "Co-op 买家注意：合同通常含「董事会审批条件」，若被董事会拒绝，可取回定金。",
          ],
        },
        {
          title: "第七步 — 申请正式贷款",
          body: "向银行提交正式贷款申请（通常在合同后 5–7 个工作日内）。贷款审核（Underwriting）通常需 30–45 天，期间银行会对房产进行评估并核实每一项细节。",
          items: [
            "银行对房产进行评估（Appraisal），评估结果将直接影响贷款批准。",
            "保持通讯畅通，及时提供补充材料，确保核保按计划推进。",
            "此期间切勿：更换工作、过度消费、开设或注销信用卡——任何一项都可能危及批准。",
            "银行将发出贷款承诺书（Commitment Letter），通常有效期至指定过户日。",
          ],
        },
        {
          title: "第八步 — 房屋检查与尽职调查",
          body: "聘请专业人士对房产进行全面检查——结构、电气、管道、屋顶、地基等。纽约法律允许买家在此阶段因重大问题退出合同（前提是合同含检查条件）。",
          items: [
            "收到检查报告后，可对发现的问题提出必要要求（如维修要求或要求降价）。",
            "Co-op 买家应审查：财务报告、董事会会议记录、储备金（Reserve）状况、未来特别评估计划。",
            "Condo 买家应审查：HOA 规章、储备金情况、诉讼记录。",
            "如为独栋房屋，建议额外检查铅涂料、石棉、地下油罐、排水系统等。",
          ],
        },
        {
          title: "第九步 — Co-op 董事会申请（仅适用于 Co-op）",
          body: "Co-op 购房需经董事会审批。你需准备完整的 Board Package（申请材料）、参加面试，并等待董事会决定——这是 Co-op 独有的环节，往往也是整个购房过程中要求最严的部分。",
          items: [
            "准备完整 Board Package：财务报表、税务记录、银行流水、推荐信、个人陈述等——通常厚达几十页，由律师和经纪人协助整理。",
            "提交后参加董事会面试（Board Interview），回答关于居住计划与财务状况的问题。",
            "审批周期通常 2–4 周，部分 Co-op 标准更为严格。",
            "董事会拒绝时无需给出理由——若被拒，买家可取回合同定金。",
          ],
        },
        {
          title: "第十步 — 过户前准备与过户日",
          body: "在最后阶段，律师确认产权无问题，银行出具最终贷款文件，你电汇过户资金。过户日当天，买卖双方、双方律师、银行代表与产权公司代表齐聚一堂，完成所有文件签署与产权转移。",
          items: [
            "过户前清单：律师确认产权搜索无问题并安排产权保险；仔细核对最终贷款文件（Closing Disclosure）的贷款金额、利率、月供与过户费用明细。",
            "提前 1–2 个工作日电汇过户所需资金以确保到账，并准备好政府颁发的带照片证件（驾照或护照）。",
            "过户前 24 小时内进行最终验房（Final Walk-Through），确认房屋状态与合同一致、约定物品均留存。",
            "过户当天：签署银行文件（借款承诺书、抵押协议）与产权转让契约 Deed（各约 30–60 分钟），资金通过律师托管账户统一分配，卖方确认收款后，你正式领取钥匙。",
          ],
        },
        {
          title: "第十一步 — 过户费用详解",
          body: "纽约的过户费用在全美属于最高之列——买家通常需额外准备房价的 2–6%（纽约市内通常为 1.5–3%）。提前了解每一项费用，可避免过户桌上的意外。",
          items: [
            "买家常见费用：律师费（$1,500–$3,500）、房屋检查费（$500–$1,000）、产权保险与产权搜索、抵押贷款登记税、银行/贷款费用，以及按比例分摊的房产税。",
            "豪宅税（Mansion Tax）：购价 100 万美元及以上时，买家额外缴纳 1–3.9%，按价格梯度累进。",
            "Co-op、Condo、House 的费用结构各不相同——你的顾问会在你做决定前，提供一份针对该房产类型的逐项费用预估。",
            "首付之外，还需为装修及 3–6 个月持有成本预留储备金——Co-op 买家还需准备许多董事会要求的过户后 1–2 年月供 + 管理费流动资金。",
          ],
        },
      ],
    },
    sellerGuide: {
      eyebrow: "纽约卖房完全指南 · Homix Realty",
      title: "在纽约卖房，完整流程详解",
      lead: "从挂牌前准备到过户当天，完整梳理纽约住宅出售全流程。内容源自 Homix Realty 在皇后区、长岛及大纽约都会圈的真实成交经验，覆盖定价、营销、合同、税费与到手净收益的每一个关键环节。",
      steps: [
        {
          title: "第一步 — 了解房产类型与整理文件",
          body: "纽约住宅市场有三种主要产权形式——Co-op（合作公寓）、Condo（产权公寓）和独栋/联排住宅——每种类型的出售流程各有不同。Co-op 最为复杂：你出售的是公司股份而非不动产，每位买家都须经过楼盘董事会审批，通常需要 4–8 周。Condo 和独栋住宅限制较少，流程相对顺畅。",
          items: [
            "Co-op 卖家须在接受任何报价前，提前了解楼盘的子租规定、抵押比例限制与董事会申请材料要求——合同签署后交易流产，意味着白白浪费数月时间。",
            "提前整理以下文件：房产证或股权证书、近 12 个月维护费/物业费账单、房屋税单、历年装修许可证、楼盘财务报告（Co-op/Condo）、贷款还清金额说明。",
            "备好产权保险单及任何未结留置权资料，供律师使用。",
            "1978 年前建造的房屋须依联邦法律提供《铅漆披露》，买家有 10 天检测时间。",
          ],
        },
        {
          title: "第二步 — 市场分析与定价策略",
          body: "定价是整个卖房过程中最重要的单一决策。比较市场分析（CMA）综合近期成交、在售竞品与已撤市案例，帮你准确把握当前市场位置。目标是吸引认真的买家，而不是试探市场的上限。",
          items: [
            "你的 Homix 顾问基于同区域近期成交，按面积、房况、楼层、配置逐项调整，出具 CMA 报告，并重点标注你房产的独特卖点（景观、停车位、装修品质）。",
            "定价策略：平市价吸引稳健需求；低于市场价 3–5% 可能引发竞价战；高于市场价 5–10% 则面临滞销、被迫降价、损害市场形象的风险。",
            "季节性规律：春季（3–6月）是全年最旺时机，买家最活跃；秋季（9–11月）为次佳窗口；夏季和冬季市场相对平淡。",
            "我们在挂牌前提供到手净收益预估——扣除佣金、税费与各项费用后，你实际能拿到多少，一目了然。",
          ],
        },
        {
          title: "第三步 — 房屋准备与布置",
          body: "研究表明，经过专业布置的房屋平均成交价比未整理房屋高出 6–10%，在市场上停留时间也更短。纽约买家见多识广，对比多套房源——充分准备不是可选项，而是投资回报最高的环节之一。",
          items: [
            "深度清洁、去除个人化物品与家庭照片、简化装饰风格，让买家更容易想象自己住在这里的生活场景。",
            "挂牌前解决小问题：漏水水龙头、墙面裂缝、门窗松动、损坏灯具——任何会在买家检查中暴露的问题，都会给买家砍价的借口。",
            "高回报低成本升级：中性色调重新粉刷（$500–$2,000）、更换门把手和开关面板、浴室重新打硅胶。这些改动成本不高，却能让房子呈现出精心维护的质感。",
            "专业摄影（20–30 张明亮广角照片）与 3D 虚拟漫游（Matterport）是必须的——超过 90% 的买家在实地看房前会先在网上筛选，网络第一印象决定是否约看。",
          ],
        },
        {
          title: "第四步 — 选择经纪人与签署委托协议",
          body: "在纽约，绝大多数卖家会委托持牌经纪人代理出售。一位优秀的卖方经纪人带来的定价策略、营销能力、谈判经验与交易管理，往往能创造远超佣金的价值。签约前请在纽约州务厅（DOS）网站核实经纪人执照状态。",
          items: [
            "重点考察：经纪人在你所在社区的成交数量、成交价格与在市天数；营销方案是否覆盖 MLS、StreetEasy、社交媒体与华人渠道；以及能否用你熟悉的语言全程专业沟通。",
            "《独家出售委托协议》明确挂牌价格、佣金比例、委托期限（通常 3–6 个月）、营销授权与提前解约条款——每一条款都要仔细阅读。",
            "2024 年 NAR 和解协议后，买卖双方的经纪人佣金现已分别独立协商。签署任何协议前，请要求经纪人以书面形式说明佣金结构。",
            "纽约州要求在首次实质性接触时出示《代理关系披露》表——仔细阅读，了解经纪人是专属代表你，还是可能同时代理买卖双方。",
          ],
        },
        {
          title: "第五步 — 挂牌与市场推广",
          body: "委托协议签署、房屋准备就绪后，你的房源正式进入市场。开盘头几天的曝光至关重要——买家关注度在上市初期最高，滞销房源一旦挂牌时间过长，就会产生需要降价才能成交的负面印象。",
          items: [
            "你的房源上线 OneKey MLS，自动同步至 StreetEasy、Zillow、Realtor.com 及数十个合作网站。",
            "Homix 在此基础上叠加自有媒体推广：短视频、社区内容，以及向抖音、小红书、Instagram 百万+ 粉丝的精准触达——覆盖那些只在中文平台看房、从不上英文门户的华人买家群体。",
            "开放日：纽约都会圈黄金时段为周日下午 1–4 点。提前准备中英双语楼盘资料册，让自然光充分进入，保持整洁舒适——卖家应离开现场，让买家自由表达感受。",
            "私人带看通过 OneKey MLS ShowingTime 预约；顾问在每次带看后收集反馈，实时汇报价格疑虑、房况问题或浓厚兴趣等规律性信号。",
          ],
        },
        {
          title: "第六步 — 评估报价与谈判",
          body: "收到报价后，价格只是需要评估的六个维度之一。你的顾问会逐一呈报每份报价——纽约法律要求及时转达——并帮助你在回应前综合衡量所有因素。",
          items: [
            "综合评估：报价金额、首付比例（首付越高财务实力越强）、贷款类型（全现金风险最低）、附加条件（检验、贷款、Co-op 审批）、建议过户时间，以及——Co-op 房屋尤为重要的——买家通过董事会审批的概率。",
            "Co-op 卖家尤其注意：价格略低但财务背景强劲、材料完整的买家，往往比出价最高但审批风险大的买家更值得优先考虑。",
            "三份及以上报价时，顾问可设定截止日期发起「最高最终出价」征集，制造竞价压力；一两份报价时，直接与意向最强的买家逐条谈判。",
            "常见卖方谈判筹码：过户时间的灵活性、附带家具/家电、承担部分过户费用、提供维修信用额度（代替实际整修）。",
          ],
        },
        {
          title: "第七步 — 合同签署与律师职责",
          body: "与大多数美国州不同，纽约的房产合同由律师起草和谈判——而非经纪人。在接受任何报价前，你需要先聘请一位纽约房产律师。合同阶段通常需要 1–2 周。",
          items: [
            "流程：买卖双方达成初步条款共识（Term Sheet）→ 你的律师起草购房合同（3–5 个工作日）→ 买方律师审核并提出修改 → 双方协商定稿 → 买方签署并支付定金。",
            "合同定金通常为房价的 5–10%，由你的律师托管。若买方在无有效条件保护的情况下违约，定金可能归你所有。",
            "纽约卖方律师费通常为 $2,000–$4,000。务必选择有丰富 Co-op 或 Condo 成交经验的律师——文件疏漏可能导致严重延误或交易纠纷。",
            "Co-op 交易：合同执行后，督促买方经纪人尽快启动董事会申请——仅审批流程就需要 4–8 周，整体过户周期明显长于 Condo。",
          ],
        },
        {
          title: "第八步 — 房屋检验与银行估价",
          body: "合同签署后，买方安排专业房屋检查，买方贷款银行委托独立评估师进行银行估价。两个环节都可能影响交易走向，但做好准备后都是可以应对的。",
          items: [
            "房屋检查涵盖结构、电气、管道、HVAC、屋顶与地基。买方可能要求维修、降价或信用抵扣——你的律师与顾问会协助评估每项要求，避免过度让步。",
            "独栋住宅可能涉及额外专项检查：铅漆、石棉、地下油罐、排水系统。提前了解自家房屋状况，能有效减少合同期内的不确定性。",
            "银行估价：若估价低于合同价，买家可能要求卖家降价以填补差额。从一开始就参照真实可比成交合理定价，是避免估价不足最有效的预防措施。",
            "Co-op 交易中，买方律师还会审核楼盘财务报告与近期会议纪要——发现重大问题可能允许买方退出合同。",
          ],
        },
        {
          title: "第九步 — 过户当天",
          body: "过户通常在合同执行后 45–90 天完成（Co-op 因需等待董事会审批，周期往往更长）。产权或股权证书完成转移，资金完成拨付，你交出钥匙，交易正式结束。提前做好过户清单，确保万无一失。",
          items: [
            "过户前清单：确认所有约定维修已完成；联系水、电、燃气公司安排账户过户或取消；向银行获取贷款还清金额说明（注明有效日期）；准备好所有钥匙、门禁卡、停车遥控器与邮箱钥匙。",
            "提前与律师核对过户结算单（HUD-1 / Closing Disclosure），逐项确认各项费用无误。",
            "最终验房：买方通常在过户前 24 小时内进行，确认房屋状况符合合同约定。发现任何不符之处，在到达过户桌前解决。",
            "过户当天：双方律师及当事人出席，签署产权转让契约（Deed）及税务文件，买方完成尾款电汇，净收益当天或次一个工作日电汇至你指定账户。",
          ],
        },
        {
          title: "第十步 — 卖家税费与到手净收益",
          body: "纽约卖家的综合过户成本在全美属于最高之列——佣金、转让税与律师费合计通常占成交价的 8–10%。挂牌前就把每一项算清楚，才能准确规划实际到手金额，避免过户桌上的意外。",
          items: [
            "主要费用：经纪人佣金 5–6%；纽约州过户税 0.4%（300 万以上 0.65%）；纽约市转让税（RPTT）50 万以下 1%、50 万以上 1.425%；律师费 $2,000–$4,000；Co-op 转让费（Flip Tax）通常 1–3%，具体查看楼盘章程。",
            "资本利得税：联邦税率 0%/15%/20%（视收入与持有年限），叠加纽约州最高 10.9%。Section 121 自住房豁免：个人最多豁免 $250,000 增值，已婚联合报税最多豁免 $500,000——须满足出售前 5 年内主要居住满 2 年的条件。",
            "FIRPTA（外国人卖家特别注意）：若你不是美国公民或税务居民，买方须按成交价的 15% 预扣税款上缴 IRS。这通常远高于实际税负，建议提前咨询持牌 CPA 并申请预扣减免证书（Withholding Certificate）。",
            "到手净收益示例（成交价 $1,200,000）：扣除经纪佣金 $66,000、州过户税 $4,800、市过户税 $17,100、律师费 $3,000、杂费 $1,500 后，税前净收益约 $1,107,600（资本利得税另计）。挂牌前请向顾问索取你的个人化净收益预估。",
          ],
        },
      ],
    },
  },
  agentsPage: {
    eyebrow: "团队",
    title: "我们的经纪人",
    lead: "一支覆盖皇后区、长岛与曼哈顿的双语团队——每一位都是熟悉本地社区的纽约持牌专业人士。",
    contact: "联系",
    licenseNo: "牌照号",
  },
  contactPage: {
    eyebrow: "联系",
    title: "开始一次轻松的对话。",
    lead: "买房、卖房，或只是还在考虑——我们都乐意帮忙，没有压力，没有义务。",
    byPhone: "电话",
    byEmail: "邮箱",
    inPerson: "到访",
  },
  neighborhoodsPage: {
    eyebrow: "社区",
    title: "我们最了解的地方",
    lead: "Homix 深耕的纽约社区的本地指南。",
    viewHomes: "查看该区房源",
    backToAll: "全部社区",
    photoBy: "摄影",
    whyEyebrow: "社区研判",
    whyTitle: "我们卖的不是邮编，而是对社区的理解",
    whyBody: "从法拉盛市中心到拿骚县北岸的村镇，这些都是 Homix 每周深耕的市场。我们的经纪人在这里长大、在这里生活、也每天搭乘这些列车——因此我们的建议来自真实的在地认知，而非门户网站上的一条房源。对每个社区，我们都把这份在地熟悉与严谨的数据结合起来：房子真实的定价走向、哪些学区的口碑长期稳固、通勤实际是什么样、供需又在往哪个方向走。最终交付的，是符合公平住房原则的中英双语建议，让你可以据此行动——无论是在 7 号线旁购入第一套合作公寓，还是换购顶级学区里的一栋殖民式住宅。",
    methodology: [
      {
        title: "可比成交与定价纪律",
        body: "我们以近期、真正可比的成交为基准定价——按楼层、房况、地块与景观逐项调整，而非照搬挂牌标价。买家得到有据可依的出价策略；卖家得到市场真正能承接的价格，让房子既不滞销，也不贱卖。",
      },
      {
        title: "学区与分区",
        body: "尤其在长岛，学区边界往往比所在街道更关键。我们核实房子真正所属的学区与对口范围，关注各学区长期稳固的口碑而非某一年的排名，并提示影响你能买什么、怎么买的分区规定与合作公寓董事会规则。",
      },
      {
        title: "交通与可达性",
        body: "我们把真实的通勤画出来——哪条地铁线、哪条长岛铁路支线、渡轮或高速公路服务这套房子，以及它如何转化为门到门的时间与转售吸引力。临近车站或快车服务是长期的价值支撑，我们会像买家和未来买家那样去权衡它。",
      },
      {
        title: "供需与时机",
        body: "我们按社区跟踪库存量、在售天数与季节节奏，让时机为你所用，而不是与你作对。清楚一个市场当下偏向买方还是卖方、房源通常在何时集中放出，能把一次紧张的猜测变成一步有计划的行动。",
      },
    ],
    glanceTitle: "速览",
    glanceLabels: {
      transit: "交通",
      schools: "学区",
      character: "社区气质",
      bestFor: "适合人群",
    },
  },
  notFound: {
    eyebrow: "404",
    title: "这个页面已经搬走了。",
    lead: "你要找的页面不在这里。我们带你回到房子那边。",
    backHome: "返回首页",
    browseListings: "浏览房源",
  },
  legal: {
    note: "上线前请由专业律师和备案经纪人审核法律文本。",
    lastUpdated: "最近更新",
  },
  sell: {
    eyebrow: "卖房 · Homix",
    title: "把房子卖到买家本来就在的地方。",
    lead: "大多数房子只是挂在网站上等人来翻。Homix 把你的家做成内容，第一天就推给抖音、小红书、Instagram 上 100 万+ 的受众，中英文双语触达那些别家够不着、又往往手握现金的精准买家。结果是：更广的需求、更快的成交、更多落进你口袋的钱。",
    heroCta: "免费估价",
    proof: {
      eyebrow: "Homix 的不同之处",
      items: [
        { value: "1,000,000+", label: "触达受众" },
        { value: "EN · 中文", label: "双语营销" },
        { value: "抖音 · 小红书 · IG", label: "发布平台" },
        { value: "Flushing · NYC · LI", label: "深耕区域" },
      ],
    },
    advantagesEyebrow: "为什么把房子交给 Homix",
    advantagesTitle: "给你的房源，一个别人给不了的优势。",
    advantages: [
      {
        headline: "你的房子，第一天就推给我们自己的百万受众",
        body: "大多数房源只是挂在网站上，等着被人翻到。我们不一样：挂牌第一天，就把你的房子推送给抖音、小红书、Instagram 上 100 万+ 的粉丝——一群本就在看纽约房子的真实买家。开盘头几天看的人越多，带看越多、越快，也越容易形成抢 offer 的局面。",
      },
      {
        headline: "我们能用买家的母语，把房子卖给他们",
        body: "从营销到谈判，我们全程中英文双语，把你的房子打开给法拉盛、皇后区、长岛一大批往往手握现金的华人买家——包括那些只在微信、小红书、抖音上看房，根本不上英文网站的海外买家。买家池更大、更精准，这正是只做英文的全国大行做不到的。",
      },
      {
        headline: "把你的家拍成一个故事，而不是一组图",
        body: "我们有自己的内容工作室，像拍品牌大片一样拍你的家——电影感带看、短视频房源、中英文讲述，专为在社交平台上被刷到、被转发而做，而不是塞进 MLS 图库里没人看。好的呈现，能让买家停下手指、约看房，也能让房子卖出该有的价。",
      },
      {
        headline: "定价用数据，拍板靠人",
        body: "我们会把多个估价模型，和我们手工挑选的本地成交对比盘、实时市场热度信号交叉核对，再由持牌的 Homix 顾问拍定价格，并把每一步逻辑讲清楚给你听。一开盘就定对价，才不会越拖越掉价，最终卖得更高。",
      },
      {
        headline: "我们做足开盘头几天——最关键的窗口",
        body: "一套房子最被关注的，就是刚挂牌的头几天。我们会先用预热把一批意向买家攒起来，再各平台同时开盘，让关注集中爆发，而不是零零散散地来——这才是势头起来、多组买家抢的开始，而不是慢慢挂冷。",
      },
      {
        headline: "繁琐的事我们扛，你省心",
        body: "布置建议、摄影、营销、带看、谈判，再到对接律师、协调过户——全程由名字挂在门上的那位顾问一手包办。卖房是很多人经历过最操心的事之一；我们的活儿，就是把这份重量接过来，把成交一路稳稳推到签约桌前。",
      },
      {
        headline: "真正走在这些街区里的本地团队",
        body: "法拉盛、皇后区、长岛北岸，我们一个街区一个街区地熟——成交对比、学区、本地买家真正愿意为什么买单。正是这份本地判断，让我们敢于定价，也能在出 offer 时替你守住价格。",
      },
      {
        headline: "成交、数据、逻辑，全都摊开给你看",
        body: "不靠看不懂的网络估价，也不让你听一句空话。我们会把对比成交、市场数据，以及定价和策略背后的逻辑全摊开给你看——还会在挂牌前，先给你一份清清楚楚的到手净收益预估。",
      },
    ],
    howEyebrow: "卖房流程",
    howTitle: "从挂牌到成交，四步搞定。",
    steps: [
      {
        title: "估价与策略",
        body: "免费、有数据支撑的估价。价格和方案我们和你一起定，逻辑也讲给你听。",
      },
      {
        title: "筹备与拍摄",
        body: "先给布置建议，再由我们的工作室把你的家拍成适合社交平台的中英文内容。",
      },
      {
        title: "媒体开盘",
        body: "先做预热，挂牌第一天各平台同时开盘，推送给我们 100 万+ 的受众。",
      },
      {
        title: "上市 · 谈判 · 过户",
        body: "全面同步 MLS 与各大网站，谈判出价，对接律师与过户——全程替你打理。",
      },
    ],
    valuationEyebrow: "免费房屋估价",
    valuationTitle: "你的家值多少？",
    valuationLead: "告诉我们你的房子，Homix 顾问将为你准备一份免费、无义务的估价。",
    valuationAssurances: ["免费、无义务", "一个工作日内回复", "全程保密"],
    orCall: "或致电",
    listingsCta: {
      kicker: "在考虑卖房？",
      line: "你的家，值得的不止门口一块牌子。我们把它推给 100 万+ 双语受众，触达别家够不着的买家。",
      button: "卖房 · Homix",
    },
  },
  calculator: {
    eyebrow: "工具",
    title: "房贷计算器",
    lead: "估算你的月供。仅供参考——准确报价请咨询贷款机构。",
    homePrice: "房屋总价",
    downPayment: "首付",
    interestRate: "利率",
    loanTerm: "贷款年限",
    monthlyPayment: "预估月供",
    principalInterest: "本金 + 利息",
    loanAmount: "贷款金额",
    disclaimer: "仅估算本金与利息；不含税费、保险与 HOA。不构成贷款要约。",
  },
};

export const messages = { en, zh };
export type Messages = Dict;
