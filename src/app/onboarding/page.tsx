import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/marketing/Button";
import { Container } from "@/components/marketing/Container";
import { Eyebrow } from "@/components/marketing/Eyebrow";
import { Reveal } from "@/components/marketing/Reveal";
import { SocialPlatformIcon } from "@/components/marketing/SocialPlatformIcon";
import { getT } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Agent Onboarding",
  description:
    "Homix agent onboarding: vision, mission, leadership, in-house support, resources, and the first 90 days from paperwork to your first deal.",
};

function n2(i: number): string {
  return String(i + 1).padStart(2, "0");
}

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function OnboardingPage() {
  const { t } = await getT();
  const o = t.onboarding;

  return (
    <>
      {/* Hero */}
      <Container className="py-16 sm:py-24">
        <div className="max-w-3xl">
          <Eyebrow>{o.eyebrow}</Eyebrow>
          <h1 className="mt-5 font-serif text-4xl font-normal leading-[1.1] tracking-tight text-ink sm:text-[3.25rem]">
            {o.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-50">{o.lead}</p>
        </div>
      </Container>

      {/* Vision & Mission */}
      <section className="border-y border-line bg-surface py-16 sm:py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div className="max-w-xl">
              <Eyebrow>{o.visionMission.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.55rem]">
                {o.visionMission.title}
              </h2>
            </div>
            <p className="text-lg leading-relaxed text-ink-50">{o.visionMission.lead}</p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-2">
            {o.visionMission.items.map((item) => (
              <Reveal key={item.title} className="bg-paper">
                <div className="h-full p-7 sm:p-8">
                  <p className="font-serif text-2xl text-ink">{item.title}</p>
                  <p className="mt-4 text-base leading-relaxed text-ink-50">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Leadership */}
      <Container className="py-16 sm:py-20">
        <div className="max-w-3xl">
          <Eyebrow>{o.leadership.eyebrow}</Eyebrow>
          <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.65rem]">
            {o.leadership.title}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-50">{o.leadership.lead}</p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          {o.leadership.people.map((person, i) => (
            <Reveal key={person.name} delay={i * 70}>
              <article className="grid gap-6 border-t border-line pt-6 sm:grid-cols-[0.42fr_0.58fr]">
                <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-line">
                  <Image
                    src={person.image}
                    alt={person.name}
                    fill
                    sizes="(min-width: 1024px) 260px, (min-width: 640px) 38vw, 90vw"
                    className="object-cover object-top"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-50">
                    {person.role}
                  </p>
                  <h3 className="mt-3 font-serif text-2xl leading-tight text-ink">
                    {person.name}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-ink-50">
                    {person.bio}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {person.focus.map((focus) => (
                      <span
                        key={focus}
                        className="rounded-sm bg-surface px-3 py-1.5 text-xs text-ink"
                      >
                        {focus}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>

      {/* In-house admins */}
      <section className="border-y border-line bg-surface py-16 sm:py-20">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <Eyebrow>{o.adminTeam.eyebrow}</Eyebrow>
              <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.4rem]">
                {o.adminTeam.title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-ink-50">
                {o.adminTeam.lead}
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3">
              {o.adminTeam.members.map((member, i) => (
                <Reveal key={member.name} delay={i * 50} className="bg-paper">
                  <div className="flex h-full flex-col p-6">
                    {member.image ? (
                      <div className="relative size-16 overflow-hidden rounded-sm bg-line">
                        <Image
                          src={member.image}
                          alt={member.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                          style={{
                            objectPosition:
                              "imagePosition" in member
                                ? member.imagePosition
                                : "50% 50%",
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex size-12 items-center justify-center rounded-sm bg-ink font-serif text-lg text-paper">
                        {initials(member.name)}
                      </div>
                    )}
                    <p className="mt-5 font-serif text-xl text-ink">{member.name}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-ink-50">
                      {member.role}
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-ink-50">
                      {member.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Admin checklist */}
      <Container className="py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="max-w-xl">
            <Eyebrow>{o.adminChecklist.eyebrow}</Eyebrow>
            <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.45rem]">
              {o.adminChecklist.title}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-ink-50">
              {o.adminChecklist.lead}
            </p>
          </div>

          <div className="divide-y divide-line border-y border-line">
            {o.adminChecklist.groups.map((group, i) => (
              <Reveal key={group.title} delay={i * 45}>
                <div className="grid gap-5 py-7 md:grid-cols-[0.36fr_0.64fr]">
                  <div>
                    <p className="font-serif text-3xl text-bronze/70">{n2(i)}</p>
                    <h3 className="mt-3 font-serif text-xl leading-tight text-ink">
                      {group.title}
                    </h3>
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-50">
                      {group.owner}
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink/85">
                        <Check />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>

      {/* Resources */}
      <section className="border-t border-line bg-surface py-16 sm:py-20">
        <Container>
        <div className="max-w-3xl">
          <Eyebrow>{o.resources.eyebrow}</Eyebrow>
          <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.55rem]">
            {o.resources.title}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-50">{o.resources.lead}</p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {o.resources.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 45} className="bg-surface">
              <Link
                href={`/onboarding/resources/${item.slug}`}
                className="group flex h-full flex-col p-6 transition-colors hover:bg-paper"
              >
                <p className="font-serif text-3xl text-bronze/70">{n2(i)}</p>
                <h3 className="mt-4 font-serif text-xl leading-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-50">{item.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-bronze transition-[gap] group-hover:gap-2.5">
                  {t.common.explore}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>

        </Container>
      </section>

      {/* HOMIX social media */}
      <section className="border-t border-line bg-paper py-16 sm:py-20">
        <Container>
          <div className="overflow-hidden rounded-sm border border-line bg-surface">
            <div className="relative aspect-[16/9] bg-line sm:aspect-[2.2/1]">
              <Image
                src={o.socialMedia.image.src}
                alt={o.socialMedia.image.alt}
                fill
                sizes="(min-width: 1320px) 1320px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[0.82fr_1.18fr] lg:p-10">
              <div>
                <Eyebrow>{o.socialMedia.eyebrow}</Eyebrow>
                <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.55rem]">
                  {o.socialMedia.title}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-ink-50">
                  {o.socialMedia.lead}
                </p>
                <div className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-line bg-line">
                  {o.socialMedia.stats.map((stat) => (
                    <div key={stat.label} className="bg-paper p-4">
                      <p className="font-serif text-2xl leading-none text-bronze">
                        {stat.value}
                      </p>
                      <p className="mt-2 text-xs leading-snug text-ink-50">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
                  {o.socialMedia.pillars.map((pillar) => (
                    <article key={pillar.title} className="bg-paper p-5">
                      <p className="font-serif text-xl leading-tight text-ink">
                        {pillar.title}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed text-ink-50">
                        {pillar.body}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="mt-6">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-50">
                    {o.socialMedia.channelsTitle}
                  </p>
                  <div className="mt-3 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
                    {o.socialMedia.channels.map((channel) => (
                      <article
                        key={channel.key}
                        className="grid gap-4 bg-paper p-4 sm:grid-cols-[0.9fr_1.1fr]"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <SocialPlatformIcon platform={channel.key} />
                            <p className="text-sm font-medium text-ink">
                              {channel.name}
                            </p>
                          </div>
                          <p className="mt-3 font-serif text-lg leading-tight text-ink">
                            {channel.handle}
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-ink-50">
                            {channel.body}
                          </p>
                          {"url" in channel && channel.url ? (
                            <a
                              href={channel.url}
                              className="mt-3 inline-flex max-w-full items-center gap-1.5 break-all text-xs font-medium text-bronze hover:text-ink"
                            >
                              {channel.url}
                            </a>
                          ) : null}
                        </div>
                        <div className="relative h-52 overflow-hidden rounded-sm border border-line bg-white p-3 sm:h-48 lg:h-44">
                          <Image
                            src={channel.image}
                            alt={channel.alt}
                            fill
                            sizes="(min-width: 1024px) 210px, (min-width: 640px) 35vw, 80vw"
                            className="object-contain"
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Phases */}
      <Container className="pb-20">
        <div className="mb-10 max-w-3xl">
          <Eyebrow>{o.eyebrow}</Eyebrow>
          <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.55rem]">
            {o.title}
          </h2>
        </div>
        <div className="border-t border-line">
          {o.phases.map((p, i) => (
            <Reveal key={p.title}>
              <div className="grid gap-5 border-b border-line py-10 md:grid-cols-[0.42fr_1.58fr] md:gap-12">
                <div>
                  <p className="font-serif text-4xl text-bronze">{n2(i)}</p>
                  <h2 className="mt-3 font-serif text-2xl leading-snug text-ink">
                    {p.title}
                  </h2>
                </div>
                <div>
                  <p className="text-base leading-relaxed text-ink-50">{p.blurb}</p>
                  <ul className="mt-5 space-y-3">
                    {p.items.map((it) => (
                      <li
                        key={it}
                        className="flex gap-3 text-base leading-relaxed text-ink/85"
                      >
                        <Check />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                  {"visuals" in p &&
                  !("showVisualsOnOnboarding" in p && p.showVisualsOnOnboarding === false) &&
                  p.visuals ? (
                    <div className="mt-8 grid gap-5 sm:grid-cols-2">
                      {p.visuals.map((visual) => (
                        <figure key={visual.image}>
                          <div className="overflow-hidden rounded-sm border border-line bg-paper">
                            <Image
                              src={visual.image}
                              alt={visual.alt}
                              width={visual.width}
                              height={visual.height}
                              sizes="(min-width: 768px) 34vw, 100vw"
                              className="h-auto w-full"
                            />
                          </div>
                          <figcaption className="mt-3">
                            <p className="font-serif text-lg leading-tight text-ink">
                              {visual.title}
                            </p>
                            <p className="mt-1 text-sm text-ink-50">{visual.subtitle}</p>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>

      {/* Guides */}
      <section className="border-t border-line bg-surface py-16 sm:py-20">
        <Container>
          <Eyebrow>Client Guides · New York · OneKey MLS</Eyebrow>
          <h2 className="mt-5 font-serif text-3xl font-normal leading-tight text-ink sm:text-[2.55rem]">
            Buyer & Seller playbooks
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-50">
            Step-by-step guides grounded in New York Real Property Law and OneKey MLS standards — ready to share with clients or use as a reference in consultations.
          </p>
          <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
            <Reveal className="bg-paper">
              <Link href="/onboarding/buyer-guide" className="group flex h-full flex-col p-8 transition-colors hover:bg-surface">
                <p className="font-serif text-4xl text-bronze">01</p>
                <h3 className="mt-5 font-serif text-2xl leading-tight text-ink">{o.buyerGuide.title}</h3>
                <p className="mt-3 flex-1 text-base leading-relaxed text-ink-50">{o.buyerGuide.lead}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-bronze transition-[gap] group-hover:gap-3">
                  Read the buyer guide
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </Reveal>
            <Reveal className="bg-paper" delay={60}>
              <Link href="/onboarding/seller-guide" className="group flex h-full flex-col p-8 transition-colors hover:bg-surface">
                <p className="font-serif text-4xl text-pine">02</p>
                <h3 className="mt-5 font-serif text-2xl leading-tight text-ink">{o.sellerGuide.title}</h3>
                <p className="mt-3 flex-1 text-base leading-relaxed text-ink-50">{o.sellerGuide.lead}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-pine transition-[gap] group-hover:gap-3">
                  Read the seller guide
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Closing */}
      <section className="bg-ink py-20 text-paper sm:py-28">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-[2.6rem]">
              {o.closingTitle}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-paper/75">
              {o.closingBody}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button href="https://www.homixny.com/join" onDark>
                {t.join.heroCta}
              </Button>
              <Button href="https://www.homixny.com/contact" variant="outline" onDark>
                {t.common.contact}
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
