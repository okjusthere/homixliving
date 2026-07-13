/**
 * "HOMIX 常用做单表格" import — the Google Sheet's form library (blank + sample
 * Drive links, categorized) and the per-stage required-documents checklists,
 * as structured data. Files stay in Google Drive; only metadata lives here.
 *
 * Idempotent: forms match by (title, category) and update in place; checklist
 * items match by (groupKey, label) and are never duplicated. Safe to re-run.
 * Callers: scripts/import-resources.ts (CLI) and
 * /api/admin/import-resources (production, where Turso credentials live).
 */
import type { Client } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { checklistItems, resources } from "./schema";
import { ensureSchema } from "./ensure-schema";

type FormRow = {
  category: string;
  title: string;
  url: string;
  sampleUrl: string | null;
  sortOrder: number;
};

const FORMS: FormRow[] = [
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Selling Agent Package",
    "url": "https://drive.google.com/file/d/1Gb-OyFWSwfo2KoGTaWeRefbfhyQLHgYG/view?usp=share_link",
    "sampleUrl": "https://drive.google.com/file/d/1Gx7-6w-xX98WAoQOxRSaBhfbin8l5eG9/view?usp=drive_link",
    "sortOrder": 102
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Binder",
    "url": "https://drive.google.com/file/d/1CksGiUnkRwGVcpjVg6WiLTebjEKosxAn/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1MIUpZVnN-_XwQfGExbR_eCgPeXxSBTRe/view?usp=drive_link",
    "sortOrder": 104
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Exclusive Buyer Representation Agreement",
    "url": "https://drive.google.com/file/d/15Tq18WOxvhc_4vMBCNbK0yfBvtU0ItXP/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1MIUpZVnN-_XwQfGExbR_eCgPeXxSBTRe/view?usp=drive_link",
    "sortOrder": 106
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Non-Exclusive Buyer Representation Agreement",
    "url": "https://drive.google.com/file/d/1zVb0shEvDH4RnDBlrfUQKFZAlS5wpNCQ/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1kPijXNbFPcfaQU8FA2P1rnUuZK5G_moJ/view?usp=drive_link",
    "sortOrder": 108
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "MEMORANDUM OF OFFER TO PURCHASE/SELL",
    "url": "https://drive.google.com/file/d/1eFzb6GOHtqYuMfPtdZDxKs_q3vJEiaZd/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1H-J5tGn1hhC1bTilj725rimhF7x2PXCQ/view?usp=drive_link",
    "sortOrder": 110
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Agency Disclosure",
    "url": "https://drive.google.com/file/d/1P31r8xqNeBhUMwiKDMTzCLACUnzAdaW_/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1HNxLkh8e4zxRk3-GfGdZ1lp6O_1RW_2t/view?usp=drive_link",
    "sortOrder": 112
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Lead Paint Disclosure",
    "url": "https://drive.google.com/file/d/1TrKEITGPG4HaAE_uGfRhpfihDK_PljzJ/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1tf4UzrKEUkxk97VevcLV7oGCRb7s_lev/view?usp=drive_link",
    "sortOrder": 114
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Fair Housing Discrimination Disclosure",
    "url": "https://drive.google.com/file/d/1eOM22cT3wzDSdI1kDAwIOI7-9CGyF7iJ/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1SJ5ibvDl1rFPt-kBs8W2ucQBOPpOzHQi/view?usp=drive_link",
    "sortOrder": 116
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Deal Sheet",
    "url": "https://drive.google.com/file/d/1ln3Lr0mT7bQdWaUQF2o5qcBCo-OSUtHo/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1xDuJk9qyG7LhWiz6HYS8xsiP_bw9bqzE/view?usp=drive_link",
    "sortOrder": 118
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Confirmation of Seller's Agreement to Pay Buyer Broker",
    "url": "https://drive.google.com/file/d/1OX7fhR6m4kZc645UFHWk3HJkk-N9ek7U/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1LT0UubPkVBXyYP0FkINlqPDrfQP1mkb2/view?usp=drive_link",
    "sortOrder": 120
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Buyer Commision Agreement",
    "url": "https://drive.google.com/file/d/1sEopgpGI-qEoMKxsxUJr2GsHIG-M8cHC/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/19wUqJmWn3unxiGDEtTUznTC45KWWksH6/view?usp=drive_link",
    "sortOrder": 122
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Buyer Agreement Shown Properties",
    "url": "https://drive.google.com/file/d/1Z9vXqDcCyKxSoCzmbJ0TwxH1CR35zxHY/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1Hcm3uxEqj1goUjgrsyaHPapgENcKShyo/view?usp=drive_link",
    "sortOrder": 124
  },
  {
    "category": "买家相关 Selling Agent (Buyer side)",
    "title": "Commmission Report",
    "url": "https://drive.google.com/file/d/1lz9W43zT-lx6Y44-td73ok7QIdfQobG0/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 126
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Residential Listing Package",
    "url": "https://drive.google.com/file/d/1ubJDoYJ27_SC_QP-hGfo2yc2eVQz2ctO/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1-B6mtw_oc1GS8sfu1W9c_vOIGxdPo0_3/view?usp=drive_link",
    "sortOrder": 202
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Condo/ Coop Listing Package",
    "url": "https://drive.google.com/file/d/1ZVNgbzIzAs10YpuV__gMyqEW9VJinxYz/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1E4LhXbdiAvIshpy0vCgwtBzjeLajrSpM/view?usp=drive_link",
    "sortOrder": 204
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Confirmation of Seller's Agreement to Pay Buyer Broker",
    "url": "https://drive.google.com/file/d/1OX7fhR6m4kZc645UFHWk3HJkk-N9ek7U/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1HRkxf7qVtPcat1rCALsJzE604kOnUJDE/view?usp=drive_link",
    "sortOrder": 206
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Agency Disclosure",
    "url": "https://drive.google.com/file/d/1P31r8xqNeBhUMwiKDMTzCLACUnzAdaW_/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1HNxLkh8e4zxRk3-GfGdZ1lp6O_1RW_2t/view?usp=drive_link",
    "sortOrder": 208
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Lead Paint Disclosure",
    "url": "https://drive.google.com/file/d/1TrKEITGPG4HaAE_uGfRhpfihDK_PljzJ/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1tf4UzrKEUkxk97VevcLV7oGCRb7s_lev/view?usp=drive_link",
    "sortOrder": 210
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Fair Housing Discrimination Disclosure",
    "url": "https://drive.google.com/file/d/1eOM22cT3wzDSdI1kDAwIOI7-9CGyF7iJ/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1SJ5ibvDl1rFPt-kBs8W2ucQBOPpOzHQi/view?usp=drive_link",
    "sortOrder": 212
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Offer Presentation and Negotiation Authorization Form",
    "url": "https://drive.google.com/file/d/1GDXfoBP9gHDklNRYHoBN47U5FLUH8VU2/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/11x-UJxCN10A6S2qoeCFfJ2oX8tq5xPU7/view?usp=drive_link",
    "sortOrder": 214
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Deal Sheet",
    "url": "https://drive.google.com/file/d/1ln3Lr0mT7bQdWaUQF2o5qcBCo-OSUtHo/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1xDuJk9qyG7LhWiz6HYS8xsiP_bw9bqzE/view?usp=drive_link",
    "sortOrder": 216
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Property Condition Disclosure Statement (PCDS)",
    "url": "https://drive.google.com/file/d/1N3zL9VWh9ec483JYFKx41OadIaaotB5U/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1q-MvkN7gYFZdzQf09L0DMVucrjMUrBIS/view?usp=drive_link",
    "sortOrder": 218
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Office Exclusive Seller Disclosure (Private listing only)",
    "url": "https://drive.google.com/file/d/14QCxZukq7k_Nj67brNIyL1U6p7QCG8Fs/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1MqpXqKN7crAHHCE1qN-qFBQ1sEBhTutU/view?usp=drive_link",
    "sortOrder": 220
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Extension Agreement",
    "url": "https://drive.google.com/file/d/1uzFvcbX6zx3tMfyLa2lbty7LMh2r5rns/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1CnO4a_CwJ8JJDXOS4UBlKdCB7C0mSW0O/view?usp=drive_link",
    "sortOrder": 222
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Coming Soon Authorization Form",
    "url": "https://drive.google.com/file/d/1ZedytkrgqjMLXYfYu-Hunqrk7lSSyikP/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/160JigRJ80ULnBQWYnEVoo5AxL59MMTc_/view?usp=drive_link",
    "sortOrder": 224
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Required Fields for MLS Listing Property Data Section",
    "url": "https://drive.google.com/file/d/1B0MPihrtXfmzk2msGg6LMjm7Ws07NSGd/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1QSNntxWy62IBkQ1DOlR9eGKsZkCIBvvT/view?usp=drive_link",
    "sortOrder": 226
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Commission Report",
    "url": "https://drive.google.com/file/d/1lz9W43zT-lx6Y44-td73ok7QIdfQobG0/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 228
  },
  {
    "category": "屋主相关 Listing Agent (Seller side)",
    "title": "Brokerage Commision Agreement",
    "url": "https://drive.google.com/file/d/1RVRrj3HBplivabrW2cPvPNOxDm2YrFXe/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 230
  },
  {
    "category": "合作相关 Co-Broker",
    "title": "General Agent Collaboration Agreement",
    "url": "https://drive.google.com/file/d/1rEDd5XDTy9OhuV56014VxZZkMolujb7D/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1UoW_Lg2oJNuAGaY43Tvaj6SkUS7vbLrs/view?usp=drive_link",
    "sortOrder": 302
  },
  {
    "category": "合作相关 Co-Broker",
    "title": "Referral Form",
    "url": "https://drive.google.com/file/d/1Rxe8StB_gD5loIn_VL4Y1Lb20BRKd-Kj/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 304
  },
  {
    "category": "合作相关 Co-Broker",
    "title": "Seller Referral Form",
    "url": "https://drive.google.com/file/d/1-7BCPEoKTpeUsUcGP2jhETA3p2sM-3nO/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1e8jugzlbO3CV26L4W_mdqYFjJNiybsdG/view?usp=drive_link",
    "sortOrder": 306
  },
  {
    "category": "合作相关 Co-Broker",
    "title": "Open House Agent Collaboration Agreement",
    "url": "https://drive.google.com/file/d/1or2ef0hDxC17NO4Tlfge19bkfTZpFcqr/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1W2cfpvYnD9716lXM80mo4Men5jJuxGTP/view?usp=drive_link",
    "sortOrder": 308
  },
  {
    "category": "合作相关 Co-Broker",
    "title": "Co-broke Agreement (Off-market listing only)",
    "url": "https://drive.google.com/file/d/1OEJZqk9rqbf4ZkdOLvsnfWG2bT_bm10y/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1BILPEYJwlSA1xnf0wSVAGQxkW-VFB8J_/view?usp=drive_link",
    "sortOrder": 310
  },
  {
    "category": "商业相关 Commercial",
    "title": "LOI",
    "url": "https://drive.google.com/file/d/1azL0ru809rkoecHzUtIuuQoJcmYIigrl/view?usp=sharing",
    "sampleUrl": null,
    "sortOrder": 502
  },
  {
    "category": "商业相关 Commercial",
    "title": "Commercial Data Section",
    "url": "https://drive.google.com/file/d/1gt4BDW1l4QXFZmEzrCpc1Wa-5IsM36tv/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1qVHdebw70rIDa8KS-WKsNnVYuLFA-Fen/view?usp=drive_link",
    "sortOrder": 504
  },
  {
    "category": "商业相关 Commercial",
    "title": "NDA",
    "url": "https://drive.google.com/file/d/1FHJKpKYC2Wcw407zaJojkV1EdXR0m8Jg/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 506
  },
  {
    "category": "商业相关 Commercial",
    "title": "Business For Sale Worksheet",
    "url": "https://drive.google.com/file/d/1tJEcHLQMxakHdNzcidzKXo038_7hXQsN/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 508
  },
  {
    "category": "商业相关 Commercial",
    "title": "Land Form",
    "url": "https://drive.google.com/file/d/1aZ6pi2Ix5ggdzpe206N9TGpWGfrgcTsh/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 510
  },
  {
    "category": "商业相关 Commercial",
    "title": "Commercial (Sale) Listing Package",
    "url": "https://drive.google.com/file/d/1gt4BDW1l4QXFZmEzrCpc1Wa-5IsM36tv/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1gp9ztVz2JC_iaoipN_737p0PCbTSueSk/view?usp=drive_link",
    "sortOrder": 512
  },
  {
    "category": "商业相关 Commercial",
    "title": "Commercial (Lease) Listing Package",
    "url": "https://drive.google.com/file/d/1yIROUENqJeSPeUJTGTf_SmQAq27tu8Ug/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1aagb5HpzCa8ADsLrwA_Cris8jH5Uj9YJ/view?usp=drive_link",
    "sortOrder": 514
  },
  {
    "category": "商业相关 Commercial",
    "title": "Commerical offer",
    "url": "https://drive.google.com/file/d/1irZMZk7eGlDGkfbDafH-wgKMm8CfoJYJ/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 516
  },
  {
    "category": "出租相关 Rental",
    "title": "Rental Listing Package",
    "url": "https://drive.google.com/file/d/158Teb9XRcc5jQy-mN-u89aCkBbxBwQR5/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1v9NYBhr_X8-vkjQtrmqsItmi5THRWb0m/view?usp=drive_link",
    "sortOrder": 402
  },
  {
    "category": "出租相关 Rental",
    "title": "Agency Disclosure (Landlord/Tenant)",
    "url": "https://drive.google.com/file/d/1eJJKY3m6QBZDzdpJ2oke71Smf9AyWrUZ/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/10GFwI6PzVSw4CAhHVBwRHWld1Nz30gHt/view?usp=drive_link",
    "sortOrder": 404
  },
  {
    "category": "出租相关 Rental",
    "title": "Lead Paint Disclosure (Landlord/Tenant)",
    "url": "https://drive.google.com/file/d/1OBbRZLjp-lDZxezOjp2w0mUn7_J3_806/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1Z3b8QeB6CzCfWjQc61bRjRxPDNBmLLsq/view?usp=drive_link",
    "sortOrder": 406
  },
  {
    "category": "出租相关 Rental",
    "title": "Tenants Pay Rental Commission Agreement",
    "url": "https://drive.google.com/file/d/1ieQMZLYK9ZSB2BWz_7v8z6KzYdRYe-eo/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1VsZQ8vcANgrtr3GPRrS4Xp45tr202SOE/view?usp=drive_link",
    "sortOrder": 408
  },
  {
    "category": "出租相关 Rental",
    "title": "Landlord Pay Rental Commission Agreement",
    "url": "https://drive.google.com/file/d/1JMnH4GYaGRB9EdQ7xUCASluDzZWiGdhD/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1NFSPcNAfTrFsbonXqtlMPo4eu3t5Jce2/view?usp=drive_link",
    "sortOrder": 410
  },
  {
    "category": "出租相关 Rental",
    "title": "Tenant Application Form",
    "url": "https://drive.google.com/file/d/14EUve6ZKj5c4l2SqNy7yDwgQST8ptL-O/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 412
  },
  {
    "category": "公展相关 Open House",
    "title": "Open House Registration",
    "url": "https://drive.google.com/file/d/1-IdSkPJnnD7k6G4qpuCv3BPzW5q3_pBa/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 602
  },
  {
    "category": "公展相关 Open House",
    "title": "Open House Package",
    "url": "https://drive.google.com/file/d/1n2zDp2lrTtzZGsTu-GhUi5b4SKJd-FZQ/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 604
  },
  {
    "category": "其他表格 Other",
    "title": "Brokerage Bill/Commision Invoice",
    "url": "https://drive.google.com/file/d/1lUNC6XxQOfF7ffTJAslZAZhN-JyDDC-F/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/13mckhM-IhsJF33BX0xURvvbRsLwKIizM/view?usp=drive_link",
    "sortOrder": 702
  },
  {
    "category": "其他表格 Other",
    "title": "Status Change",
    "url": "https://drive.google.com/file/d/1i8x3StbI7JT9CC9YyC2NXQl3qu1ZMdQW/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1V7puD72ifyKUoJ5Fffr1SVRl6UOv4nnr/view?usp=drive_link",
    "sortOrder": 704
  },
  {
    "category": "其他表格 Other",
    "title": "Withdrawal Form",
    "url": "https://drive.google.com/file/d/1Lf9gqfU-jFH8FYRD3fLkHRCksKebhv7T/view?usp=drive_link",
    "sampleUrl": "https://drive.google.com/file/d/1WYBvIEixcpXvw36O0SrDqlJbEHHWgBQf/view?usp=drive_link",
    "sortOrder": 706
  },
  {
    "category": "其他表格 Other",
    "title": "Listing",
    "url": "https://drive.google.com/file/d/15h_AIaLLaHbwWOk2dfKMjzcmouvdpIDc/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 708
  },
  {
    "category": "其他表格 Other",
    "title": "Net Sheet",
    "url": "https://drive.google.com/file/d/1D1MCT1uJnsy8kjHgakX85d9CCnUpzxCC/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 710
  },
  {
    "category": "其他表格 Other",
    "title": "Manhattan-Rental Listing Agreement",
    "url": "https://drive.google.com/file/d/1HW4q3DAxyzMop20LNBQif6N6S7hjJyR_/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 712
  },
  {
    "category": "其他表格 Other",
    "title": "Manhattan-Condo Listing Agreement",
    "url": "https://drive.google.com/file/d/1jWsjxBU6B62_FgI3dVWx8tj7StChtNti/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 714
  },
  {
    "category": "其他表格 Other",
    "title": "Co-Listing Agreement Addendum",
    "url": "https://drive.google.com/file/d/1oY6kOhg-EGgWMUyYeSiM__pmAZSXL8xB/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 716
  },
  {
    "category": "Homix Living · 买家相关 Selling Agent (Buyer side)",
    "title": "Agent Enrolls Package",
    "url": "https://drive.google.com/file/d/1Cl8inXd6JFTtBf7c_2aM3U-cT5yuQ45t/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 802
  },
  {
    "category": "Homix Living · 买家相关 Selling Agent (Buyer side)",
    "title": "Manhattan-Condo List Agreement",
    "url": "https://drive.google.com/file/d/1fZqoMDDNlPLGl2pf_jtmKOI2pbLMIUgx/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 804
  },
  {
    "category": "Homix Living · 买家相关 Selling Agent (Buyer side)",
    "title": "Manhattan-Rental Listing Agreement",
    "url": "https://drive.google.com/file/d/1PlNunVcCUibkiOm7bX1hsSRdt7r-iECQ/view?usp=drive_link",
    "sampleUrl": null,
    "sortOrder": 806
  }
];

const CHECKLISTS: Record<string, string[]> = {
  "new-listing-residential": [
    "Listing Agreement（both agents need if Co-Listing）",
    "Agency Disclosure",
    "Lead Paint Disclosure",
    "Property Disclosure Statement",
    "Fair Housing Disclosure",
    "Co-broke Agreement（有 Co-Listing 的话需要）"
  ],
  "pending": [
    "Agency Disclosure (Signed by buyer)",
    "Lead Paint (Signed by buyer)",
    "Lead Paint Booklet (for buyer to keep)",
    "Fair Housing Disclosure (Signed by buyer)",
    "Deal Sheet (Control card) to office",
    "合约（Fully Executed Contract）"
  ],
  "closing": [
    "Commission Check",
    "Commission Report"
  ],
  "new-listing-rental": [
    "Listing Data Section",
    "Listing Agreement Contract Page",
    "Agency Disclosure",
    "Lead Paint Disclosure",
    "Fair Housing Disclosure"
  ],
  "rented": [
    "Signed Lease",
    "Agency Disclosure for Rental (Signed by Tenant)",
    "Lead Paint Disclosure for Rental (Signed by Tenant)",
    "Lead Paint Booklet (for Tenant)",
    "Fair Housing Disclosure (signed by Tenant)",
    "Copy of Rental Check",
    "Commission Check",
    "Commission Report"
  ]
};

export interface ImportSummary {
  formsInserted: number;
  formsUpdated: number;
  checklistInserted: number;
  checklistSkipped: number;
}

export async function runResourcesImport(client: Client): Promise<ImportSummary> {
  // Schema first, so one call works on a fresh database too.
  await ensureSchema(client);
  const db = drizzle(client, { schema });

  let formsInserted = 0;
  let formsUpdated = 0;
  for (const f of FORMS) {
    const [existing] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.title, f.title), eq(resources.category, f.category)))
      .limit(1);
    if (existing) {
      await db
        .update(resources)
        .set({
          url: f.url,
          sampleUrl: f.sampleUrl,
          sortOrder: f.sortOrder,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(resources.id, existing.id));
      formsUpdated++;
    } else {
      await db.insert(resources).values({
        title: f.title,
        category: f.category,
        url: f.url,
        sampleUrl: f.sampleUrl,
        sortOrder: f.sortOrder,
      });
      formsInserted++;
    }
  }

  let checklistInserted = 0;
  let checklistSkipped = 0;
  for (const [groupKey, labels] of Object.entries(CHECKLISTS)) {
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const [existing] = await db
        .select()
        .from(checklistItems)
        .where(and(eq(checklistItems.groupKey, groupKey), eq(checklistItems.label, label)))
        .limit(1);
      if (existing) {
        checklistSkipped++;
        continue;
      }
      await db.insert(checklistItems).values({ groupKey, label, sortOrder: (i + 1) * 10 });
      checklistInserted++;
    }
  }

  return { formsInserted, formsUpdated, checklistInserted, checklistSkipped };
}
