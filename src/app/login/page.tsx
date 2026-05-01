"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Btn, EditorialInput } from "@/components/homix/primitives";
import { HomixMark } from "@/components/homix/server-primitives";
import { tone } from "@/components/homix/tokens";
import { toast } from "sonner";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      // signIn with email magic link.
      // The "name" hint isn't standard for Resend provider; we'll capture it in events.createUser via the user record.
      // For now we just use email. Display name can be set later in profile.
      await signIn("resend", { email: email.trim(), redirect: true, redirectTo: "/login/check-email" });
    } catch {
      toast.error("Could not send magic link");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <HomixMark size={36} />
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: tone.card, border: `1px solid ${tone.line}` }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Sign in
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 36,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: tone.ink,
              marginBottom: 8,
            }}
          >
            Welcome back.
          </h1>
          <p className="text-[13.5px]" style={{ color: tone.ink70 }}>
            Enter your email — we&rsquo;ll send you a magic link to sign in. New
            here? Same flow signs you up.
          </p>

          {error && (
            <div
              className="mt-5 rounded-lg p-3 text-[12.5px]"
              style={{
                background: tone.roseSoft,
                color: tone.rose,
                border: `1px solid ${tone.rose}30`,
              }}
            >
              {error === "AccessDenied"
                ? "Access denied. Your account may be pending approval — check with your team admin."
                : "Sign-in failed. Please try again."}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                className="text-[11px] uppercase tracking-[0.1em] block mb-1.5"
                style={{ color: tone.ink50 }}
              >
                Email
              </label>
              <EditorialInput
                value={email}
                onChange={setEmail}
                placeholder="you@homixny.com"
                mono
              />
            </div>

            <Btn
              variant="primary"
              size="lg"
              type="submit"
              disabled={submitting || !email}
              className="w-full"
            >
              {submitting ? "Sending magic link…" : "Send magic link"}
            </Btn>
          </form>

          <div className="mt-6 text-[12px] text-center" style={{ color: tone.ink50 }}>
            New brokers: just enter your email and we&rsquo;ll set up your account.
            Admin will activate it shortly after.
          </div>
        </div>
      </div>
    </div>
  );
}
