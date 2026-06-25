import type { Metadata } from "next";
import { Container } from "@/components/marketing/Container";
import { Eyebrow } from "@/components/marketing/Eyebrow";
import { Button } from "@/components/marketing/Button";
import { getT } from "@/lib/i18n";
import { buyerCoachUrl } from "@/lib/embeds";

export const metadata: Metadata = {
  title: "Buyer Coach",
  description:
    "Homix's AI buyer coach — ask anything about buying a home in New York. Co-op vs. condo, board packages, closing costs, and the offer process, in plain language.",
};

export default async function BuyerCoachPage() {
  const { t } = await getT();

  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-3xl">
        <Eyebrow>{t.buyercoach.eyebrow}</Eyebrow>
        <h1 className="mt-4 font-serif text-4xl font-normal leading-tight tracking-tight text-ink sm:text-5xl">
          {t.buyercoach.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-50">{t.buyercoach.lead}</p>
      </div>

      <div className="mt-10">
        {buyerCoachUrl ? (
          <iframe
            src={buyerCoachUrl}
            title={t.buyercoach.title}
            loading="lazy"
            className="h-[80vh] min-h-[600px] w-full rounded-sm border border-line bg-surface"
            allow="clipboard-write; microphone"
          />
        ) : (
          <div className="rounded-sm border border-line bg-surface p-10 text-center">
            <p className="font-serif text-xl text-ink">{t.buyercoach.fallbackTitle}</p>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-ink-50">
              {t.buyercoach.fallbackBody}
            </p>
            <div className="mt-6">
              <Button href="https://www.homixny.com/contact">{t.buyercoach.talkToAdvisor}</Button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-ink-50">
        {t.buyercoach.disclaimer}
      </p>
    </Container>
  );
}
