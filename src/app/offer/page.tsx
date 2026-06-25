import type { Metadata } from "next";
import { Container } from "@/components/marketing/Container";
import { Eyebrow } from "@/components/marketing/Eyebrow";
import { Reveal } from "@/components/marketing/Reveal";
import { Button } from "@/components/marketing/Button";
import { TallyEmbed } from "@/components/marketing/TallyEmbed";
import { getT } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";
import { offerTallyId, offerTallyIdZh } from "@/lib/embeds";

export const metadata: Metadata = {
  title: "Make an Offer",
  description:
    "Submit an offer on a New York home with Homix. Tell us the property and your terms — a Homix advisor reviews every submission and follows up to formalize your offer.",
};

function n2(i: number): string {
  return String(i + 1).padStart(2, "0");
}

export default async function OfferPage() {
  const { locale, t } = await getT();
  const { phone, phoneHref } = siteConfig.contact;
  const formId = locale === "zh" ? offerTallyIdZh : offerTallyId;

  return (
    <>
      {/* Prep */}
      <section className="border-b border-line bg-surface py-16 sm:py-20">
        <Container>
          <Eyebrow>{t.offer.prepEyebrow}</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl font-normal leading-tight tracking-tight text-ink sm:text-5xl">
            {t.offer.prepTitle}
          </h1>
          <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-3">
            {t.offer.prep.map((p, i) => (
              <Reveal key={p.title} delay={i * 60} className="bg-surface">
                <div className="h-full p-8">
                  <p className="font-serif text-2xl text-bronze/60">{n2(i)}</p>
                  <p className="mt-3 font-serif text-xl text-ink">{p.title}</p>
                  <p className="mt-3 text-base leading-relaxed text-ink-50">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Form */}
      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <Eyebrow>{t.offer.formEyebrow}</Eyebrow>
          <div className="mt-6">
            {formId ? (
              <TallyEmbed formId={formId} title={t.offer.title} />
            ) : (
              <div className="rounded-sm border border-line bg-surface p-8 text-center sm:p-10">
                <p className="font-serif text-xl text-ink">{t.offer.fallbackTitle}</p>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-ink-50">
                  {t.offer.fallbackBody}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  <Button href="https://www.homixny.com/contact">{t.offer.talkToUs}</Button>
                  <Button href={phoneHref} variant="ghost">
                    {phone}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-ink-50">{t.offer.disclaimer}</p>
        </div>
      </Container>
    </>
  );
}
