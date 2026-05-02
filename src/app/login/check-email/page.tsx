import Link from "next/link";
import { redirect } from "next/navigation";
import { HomixMark } from "@/components/homix/server-primitives";
import { tone } from "@/components/homix/tokens";
import { auth } from "@/auth";

export default async function CheckEmailPage() {
  // Defense in depth: if a magic link click ever lands here AND the user is
  // already authenticated (e.g. an old in-flight email or a stale callback URL
  // from before the redirectTo bug fix), bounce them straight to the app
  // instead of showing a confusing "check your email" message.
  const session = await auth();
  if (session?.user?.id) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <HomixMark size={36} />
        </div>

        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: tone.card, border: `1px solid ${tone.line}` }}
        >
          <div
            className="text-[40px] mb-3"
            style={{ lineHeight: 1 }}
            aria-hidden
          >
            📬
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 32,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: tone.ink,
              marginBottom: 12,
            }}
          >
            Check your email.
          </h1>
          <p className="text-[14px]" style={{ color: tone.ink70 }}>
            We just sent you a magic link. Click it within 24 hours to sign in.
          </p>
          <p className="text-[12px] mt-4" style={{ color: tone.ink50 }}>
            Don&rsquo;t see it? Check your spam folder, or{" "}
            <Link href="/login" className="underline" style={{ color: tone.accent }}>
              try again
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
