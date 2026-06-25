import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/marketing/Button";
import { Container } from "@/components/marketing/Container";
import { Eyebrow } from "@/components/marketing/Eyebrow";
import { Reveal } from "@/components/marketing/Reveal";
import { getT } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "New York Buyer Guide",
  description:
    "Step-by-step guide to buying a home in New York State — agency disclosure, buyer representation, OneKey MLS, contracts, inspections, and closing.",
};

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="var(--color-bronze)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function BuyerGuidePage() {
  const { t } = await getT();
  const g = t.onboarding.buyerGuide;

  return (
    <>
      {/* Hero */}
      <Container className="py-16 sm:py-24">
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 text-sm text-ink-50 transition-colors hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Onboarding
        </Link>
        <div className="mt-8 max-w-3xl">
          <Eyebrow>{g.eyebrow}</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl font-normal leading-[1.1] tracking-tight text-ink sm:text-[3.25rem]">
            {g.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-50">{g.lead}</p>
        </div>
      </Container>

      {/* Steps */}
      <Container className="pb-24">
        <div className="border-t border-line">
          {g.steps.map((step, i) => (
            <Reveal key={step.title}>
              <div className="grid gap-5 border-b border-line py-10 md:grid-cols-[0.38fr_1.62fr] md:gap-12">
                <div>
                  <p className="font-serif text-4xl text-bronze">{String(i + 1).padStart(2, "0")}</p>
                  <h2 className="mt-3 font-serif text-2xl leading-snug text-ink">
                    {step.title.replace(/^\d+\s*[—–-]\s*|^第.+步\s*[—–-]\s*/, "")}
                  </h2>
                </div>
                <div>
                  <p className="text-base leading-relaxed text-ink-50">{step.body}</p>
                  <ul className="mt-5 space-y-3">
                    {step.items.map((it) => (
                      <li key={it} className="flex gap-3 text-base leading-relaxed text-ink/85">
                        <Check />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>

      {/* Footer CTA */}
      <section className="border-t border-line bg-surface py-16 sm:py-20">
        <Container>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-serif text-2xl text-ink">Ready to find your home?</p>
              <p className="mt-2 text-base text-ink-50">Talk to a Homix advisor — no pressure, no obligation.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button href="https://www.homixny.com/listings">Browse listings</Button>
              <Button href="https://www.homixny.com/contact" variant="outline">
                Contact us
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
