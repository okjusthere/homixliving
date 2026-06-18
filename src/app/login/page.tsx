"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
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

function GoogleLogo() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

type Providers = Record<
  string,
  { id: string; name: string; type: string }
> | null;

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const [submittingGoogle, setSubmittingGoogle] = useState(false);
  const [providers, setProviders] = useState<Providers>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({}));
  }, []);

  const hasGoogle = providers && "google" in providers;

  const handleGoogleSubmit = async () => {
    setSubmittingGoogle(true);
    try {
      await signIn("google", { redirect: true, redirectTo: "/" });
    } catch {
      toast.error("Could not sign in with Google");
      setSubmittingGoogle(false);
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
            Use your Google account to access Homix Deals.
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
                ? "Access denied. Your account may be pending activation."
                : "Sign-in failed. Please try again."}
            </div>
          )}

          {hasGoogle && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleGoogleSubmit}
                disabled={submittingGoogle}
                className="w-full h-11 rounded-lg flex items-center justify-center gap-3 transition-colors hover:opacity-90"
                style={{
                  background: "#fff",
                  border: `1px solid ${tone.line}`,
                  color: tone.ink,
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                <GoogleLogo />
                <span>
                  {submittingGoogle
                    ? "Redirecting..."
                    : "Continue with Google"}
                </span>
              </button>
            </div>
          )}

          {!providers && (
            <div className="mt-6 text-[12px] text-center" style={{ color: tone.ink50 }}>
              Loading sign-in options...
            </div>
          )}

          {providers && !hasGoogle && (
            <div className="mt-6 text-[12px] text-center" style={{ color: tone.ink50 }}>
              Google sign-in is not configured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
