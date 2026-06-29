import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/marketing/Button";
import { Container } from "@/components/marketing/Container";
import { Eyebrow } from "@/components/marketing/Eyebrow";
import { SocialPlatformIcon } from "@/components/marketing/SocialPlatformIcon";
import { getT, messages } from "@/lib/i18n";

export async function generateStaticParams() {
  return messages.en.onboarding.resources.items.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = messages.en.onboarding.resources.items.find((r) => r.slug === slug);
  if (!item) return { title: "Resource not found" };
  return {
    title: `${item.title} — Onboarding Resources`,
    description: item.body,
  };
}

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t } = await getT();
  const o = t.onboarding;
  const item = o.resources.items.find((r) => r.slug === slug);
  if (!item) notFound();
  const trainingVisuals =
    slug === "training-library"
      ? o.phases.flatMap((phase) =>
          "visuals" in phase && phase.visuals ? phase.visuals : [],
        )
      : [];
  const brokerageOperations =
    slug === "brokerage-operations" ? o.resources.brokerageOperationsDetail : null;
  const marketingMedia =
    slug === "marketing-media" ? o.resources.marketingMediaDetail : null;
  const eoDirectives =
    slug === "eo-directives" ? o.resources.eoDirectivesDetail : null;
  const selfBranding =
    slug === "self-branding" ? o.resources.selfBrandingDetail : null;
  const mentorshipDealSupport =
    slug === "mentorship-deal-support" ? o.resources.mentorshipDealSupportDetail : null;

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
          {o.resources.eyebrow}
        </Link>
        <div className="mt-8 max-w-3xl">
          <Eyebrow>{o.resources.title}</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl font-normal leading-[1.1] tracking-tight text-ink sm:text-[3.25rem]">
            {item.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-50">{item.body}</p>
        </div>
      </Container>

      {eoDirectives ? (
        <section className="border-t border-line bg-surface py-16 sm:py-20">
          <Container>
            <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
              <div className="max-w-xl">
                <Eyebrow>{eoDirectives.eyebrow}</Eyebrow>
                <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                  {eoDirectives.title}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-ink-50">
                  {eoDirectives.lead}
                </p>
                <p className="mt-6 border-l-2 border-bronze pl-4 text-sm leading-relaxed text-ink/75">
                  {eoDirectives.note}
                </p>
              </div>

              <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
                {eoDirectives.items.map((entry, i) => (
                  <article key={entry.title} className="flex h-full flex-col bg-paper p-6">
                    <p className="font-serif text-3xl text-bronze/70">
                      {String(i + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-4 font-serif text-xl leading-tight text-ink">
                      {entry.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink-50">
                      {entry.body}
                    </p>
                    <ul className="mt-5 space-y-3">
                      {entry.items.map((line) => (
                        <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bronze" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button href="https://www.homixny.com/contact">{t.common.contact}</Button>
              <Button href="/onboarding" variant="outline">{o.eyebrow}</Button>
            </div>
          </Container>
        </section>
      ) : marketingMedia ? (
        <>
          <section className="border-t border-line bg-surface py-16 sm:py-20">
            <Container>
              <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
                <div className="max-w-xl">
                  <Eyebrow>{marketingMedia.eyebrow}</Eyebrow>
                  <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                    {marketingMedia.workflowTitle}
                  </h2>
                  <p className="mt-5 text-base leading-relaxed text-ink-50">
                    {marketingMedia.lead}
                  </p>
                </div>
                <div className="divide-y divide-line border-y border-line">
                  {marketingMedia.workflows.map((workflow, i) => (
                    <div key={workflow.title} className="grid gap-5 py-7 md:grid-cols-[0.34fr_0.66fr]">
                      <div>
                        <p className="font-serif text-3xl text-bronze/70">
                          {String(i + 1).padStart(2, "0")}
                        </p>
                        <h3 className="mt-3 font-serif text-xl leading-tight text-ink">
                          {workflow.title}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-ink-50">
                          {workflow.body}
                        </p>
                      </div>
                      <ul className="space-y-3">
                        {workflow.items.map((entry) => (
                          <li key={entry} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bronze" />
                            <span>{entry}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </Container>
          </section>

          <section className="border-t border-line bg-paper py-16 sm:py-20">
            <Container>
              <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
                <div className="max-w-xl">
                  <Eyebrow>{marketingMedia.eyebrow}</Eyebrow>
                  <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                    {marketingMedia.socialTitle}
                  </h2>
                  <p className="mt-5 text-base leading-relaxed text-ink-50">
                    {marketingMedia.socialLead}
                  </p>
                </div>
                <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                  {o.resources.socialPlatforms.map((platform) => (
                    <article key={platform.key} className="bg-surface p-5">
                      <div className="flex size-12 items-center justify-center rounded-sm border border-line bg-paper">
                        <SocialPlatformIcon platform={platform.key} />
                      </div>
                      <p className="mt-4 font-medium text-ink">{platform.name}</p>
                      <p className="mt-2 text-sm leading-relaxed text-ink-50">
                        {platform.body}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </Container>
          </section>

          <section className="border-t border-line bg-surface py-16 sm:py-20">
            <Container>
              <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
                <div className="max-w-xl">
                  <Eyebrow>{marketingMedia.eyebrow}</Eyebrow>
                  <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                    {marketingMedia.supportTitle}
                  </h2>
                </div>
                <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
                  {marketingMedia.supportItems.map((entry) => (
                    <div key={entry} className="flex gap-3 bg-paper p-5 text-sm leading-relaxed text-ink/85">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bronze" />
                      <span>{entry}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button href="https://www.homixny.com/contact">{t.common.contact}</Button>
                <Button href="/onboarding" variant="outline">{o.eyebrow}</Button>
              </div>
            </Container>
          </section>
        </>
      ) : brokerageOperations ? (
        <>
          <section className="border-t border-line bg-surface py-16 sm:py-20">
            <Container>
              <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
                <div className="max-w-xl">
                  <Eyebrow>{brokerageOperations.eyebrow}</Eyebrow>
                  <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                    {brokerageOperations.workflowTitle}
                  </h2>
                  <p className="mt-5 text-base leading-relaxed text-ink-50">
                    {brokerageOperations.lead}
                  </p>
                  <a
                    href={brokerageOperations.masterSheetUrl}
                    className="mt-7 inline-flex items-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition-colors hover:bg-bronze"
                  >
                    {brokerageOperations.masterSheetLabel}
                  </a>
                </div>
                <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
                  {brokerageOperations.workflows.map((workflow) => (
                    <article key={workflow.title} className="bg-paper p-6">
                      <h3 className="font-serif text-xl leading-tight text-ink">
                        {workflow.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-ink-50">
                        {workflow.body}
                      </p>
                      <ul className="mt-5 space-y-3">
                        {workflow.items.map((entry) => (
                          <li key={entry} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bronze" />
                            <span>{entry}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            </Container>
          </section>

          <section className="border-t border-line bg-paper py-16 sm:py-20">
            <Container>
              <div className="max-w-3xl">
                <Eyebrow>{brokerageOperations.eyebrow}</Eyebrow>
                <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                  {brokerageOperations.toolsTitle}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-ink-50">
                  {brokerageOperations.toolsLead}
                </p>
              </div>
              <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                {brokerageOperations.tools.map((tool) => (
                  <article key={tool.name} className="bg-surface p-6">
                    <p className="font-serif text-xl leading-tight text-ink">{tool.name}</p>
                    <p className="mt-3 text-sm leading-relaxed text-ink-50">{tool.body}</p>
                  </article>
                ))}
              </div>
            </Container>
          </section>

          <section className="border-t border-line bg-surface py-16 sm:py-20">
            <Container>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <Eyebrow>{brokerageOperations.eyebrow}</Eyebrow>
                  <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                    {brokerageOperations.formsTitle}
                  </h2>
                  <p className="mt-5 text-base leading-relaxed text-ink-50">
                    {brokerageOperations.formsLead}
                  </p>
                </div>
                <a
                  href={brokerageOperations.masterSheetUrl}
                  className="inline-flex w-fit items-center rounded-sm border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  {brokerageOperations.masterSheetLabel}
                </a>
              </div>

              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                {brokerageOperations.formGroups.map((group) => (
                  <article key={group.title} className="overflow-hidden rounded-sm border border-line bg-paper">
                    <div className="border-b border-line p-6">
                      <h3 className="font-serif text-2xl leading-tight text-ink">
                        {group.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-50">
                        {group.description}
                      </p>
                    </div>
                    <div className="divide-y divide-line">
                      {group.forms.map((form) => (
                        <div key={form.name} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium leading-relaxed text-ink">
                            {form.name}
                          </p>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <a
                              href={form.blankLink}
                              className="rounded-sm bg-surface px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
                            >
                              {brokerageOperations.blankLabel}
                            </a>
                            {"sampleLink" in form && form.sampleLink ? (
                              <a
                                href={form.sampleLink}
                                className="rounded-sm border border-line px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-ink"
                              >
                                {brokerageOperations.sampleLabel}
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </Container>
          </section>

          <section className="border-t border-line bg-paper py-16 sm:py-20">
            <Container>
              <div className="max-w-3xl">
                <Eyebrow>{brokerageOperations.eyebrow}</Eyebrow>
                <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                  {brokerageOperations.submissionTitle}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-ink-50">
                  {brokerageOperations.submissionLead}
                </p>
              </div>
              <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-2 lg:grid-cols-5">
                {brokerageOperations.submissionGroups.map((group) => (
                  <article key={group.title} className="bg-surface p-6">
                    <h3 className="font-serif text-xl leading-tight text-ink">
                      {group.title}
                    </h3>
                    <ul className="mt-5 space-y-3">
                      {group.items.map((entry) => (
                        <li key={entry} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bronze" />
                          <span>{entry}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button href="https://www.homixny.com/contact">{t.common.contact}</Button>
                <Button href="/onboarding" variant="outline">{o.eyebrow}</Button>
              </div>
            </Container>
          </section>
        </>
      ) : selfBranding ? (
        <>
          <section className="border-t border-line bg-surface py-16 sm:py-20">
            <Container>
              <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
                <div className="max-w-xl">
                  <Eyebrow>{selfBranding.eyebrow}</Eyebrow>
                  <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
                    {selfBranding.stepsTitle}
                  </h2>
                  <p className="mt-5 text-base leading-relaxed text-ink-50">
                    {selfBranding.lead}
                  </p>
                </div>
                <div className="divide-y divide-line border-y border-line">
                  {selfBranding.steps.map((step, i) => (
                    <div key={step.title} className="grid gap-5 py-7 md:grid-cols-[0.34fr_0.66fr]">
                      <div>
                        <p className="font-serif text-3xl text-bronze/70">
                          {String(i + 1).padStart(2, "0")}
                        </p>
                        <h3 className="mt-3 font-serif text-xl leading-tight text-ink">
                          {step.title}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-ink-50">
                          {step.body}
                        </p>
                      </div>
                      <div>
                        <ul className="space-y-3">
                          {step.items.map((entry) => (
                            <li key={entry} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bronze" />
                              <span>{entry}</span>
                            </li>
                          ))}
                        </ul>
                        {"examples" in step && step.examples ? (
                          <div className="mt-6 grid gap-5 lg:grid-cols-2">
                            {step.examples.map((example) => (
                              <figure
                                key={example.image}
                                className={step.examples.length === 1 ? "lg:col-span-2" : ""}
                              >
                                <div className="overflow-hidden rounded-sm border border-line bg-paper">
                                  <Image
                                    src={example.image}
                                    alt={example.alt}
                                    width={example.width}
                                    height={example.height}
                                    sizes="(min-width: 1024px) 38vw, 100vw"
                                    unoptimized={example.image.endsWith(".svg")}
                                    className="h-auto w-full"
                                  />
                                </div>
                                <figcaption className="mt-3">
                                  <p className="font-serif text-lg leading-tight text-ink">
                                    {example.title}
                                  </p>
                                  <p className="mt-1.5 text-sm leading-relaxed text-ink-50">
                                    {example.body}
                                  </p>
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Container>
          </section>

          <section className="border-t border-line bg-surface py-16 sm:py-20">
            <Container>
              <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-3">
                <div className="bg-paper p-7">
                  <h2 className="font-serif text-2xl leading-tight text-ink">
                    {selfBranding.signatureTitle}
                  </h2>
                  <ul className="mt-5 space-y-2.5">
                    {selfBranding.signatureLines.map((line) => (
                      <li key={line} className="text-sm leading-relaxed text-ink-50">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-paper p-7">
                  <h2 className="font-serif text-2xl leading-tight text-ink">
                    {selfBranding.flyerTitle}
                  </h2>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {selfBranding.flyerTypes.map((type) => (
                      <span key={type} className="rounded-sm bg-surface px-3 py-2 text-sm text-ink">
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bg-paper p-7">
                  <h2 className="font-serif text-2xl leading-tight text-ink">
                    {selfBranding.packageTitle}
                  </h2>
                  <p className="mt-5 text-sm leading-relaxed text-ink-50">
                    {selfBranding.packageBody}
                  </p>
                </div>
              </div>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button href="https://www.homixny.com/contact">{t.common.contact}</Button>
                <Button href="/onboarding" variant="outline">{o.eyebrow}</Button>
              </div>
            </Container>
          </section>
        </>
      ) : mentorshipDealSupport ? (
        <section className="border-t border-line bg-surface py-16 sm:py-20">
          <Container>
            <div className="max-w-3xl">
              <Eyebrow>{mentorshipDealSupport.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.55rem]">
                {mentorshipDealSupport.title}
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-50">
                {mentorshipDealSupport.lead}
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {mentorshipDealSupport.items.map((entry, i) => (
                <article key={entry.title} className="flex h-full flex-col bg-paper p-7">
                  <p className="font-serif text-3xl text-bronze/70">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-4 font-serif text-xl leading-tight text-ink">
                    {entry.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-50">{entry.body}</p>
                </article>
              ))}
            </div>
            <div className="mt-10 rounded-sm border border-line bg-paper p-8 sm:p-10">
              <p className="font-serif text-2xl leading-snug text-ink sm:text-[1.7rem]">
                {mentorshipDealSupport.closing}
              </p>
            </div>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button href="https://www.homixny.com/contact">{t.common.contact}</Button>
              <Button href="/onboarding" variant="outline">{o.eyebrow}</Button>
            </div>
          </Container>
        </section>
      ) : trainingVisuals.length ? (
        <section className="border-t border-line bg-surface py-16 sm:py-20">
          <Container>
            <div className="columns-1 gap-8 sm:columns-2 lg:columns-3">
              {trainingVisuals.map((visual) => (
                <figure key={visual.image} className="mb-8 break-inside-avoid">
                  <div className="overflow-hidden rounded-sm border border-line bg-paper">
                    <Image
                      src={visual.image}
                      alt={visual.alt}
                      width={visual.width}
                      height={visual.height}
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="h-auto w-full"
                    />
                  </div>
                  <figcaption className="mt-4">
                    <h2 className="font-serif text-xl leading-tight text-ink">
                      {visual.title}
                    </h2>
                    <p className="mt-1 text-sm text-ink-50">{visual.subtitle}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap gap-4">
              <Button href="/training">{t.common.training}</Button>
              <Button href="https://www.homixny.com/contact" variant="outline">{t.common.contact}</Button>
            </div>
          </Container>
        </section>
      ) : (
        <section className="border-t border-line bg-surface py-16 sm:py-20">
          <Container>
            <div className="mx-auto max-w-2xl rounded-sm border border-dashed border-line bg-paper px-8 py-16 text-center">
              <p className="font-serif text-2xl text-ink">{o.resources.detailComingTitle}</p>
              <p className="mt-4 text-base leading-relaxed text-ink-50">
                {o.resources.detailComingBody}
              </p>
              <Button href="https://www.homixny.com/contact" className="mt-8">{t.common.contact}</Button>
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
