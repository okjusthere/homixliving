import { signOut } from "@/auth";
import { Btn } from "@/components/homix/primitives";
import { HomixMark } from "@/components/homix/server-primitives";
import { tone } from "@/components/homix/tokens";

export default function PendingApprovalPage() {
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
            ⏳
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 30,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: tone.ink,
              marginBottom: 12,
            }}
          >
            Pending approval
          </h1>
          <p className="text-[14px]" style={{ color: tone.ink70 }}>
            Your account has been created. An admin needs to activate it before
            you can start working.
          </p>
          <p className="text-[12px] mt-4" style={{ color: tone.ink50 }}>
            Reach out to your team lead — they&rsquo;ll see you in the Agents
            page.
          </p>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-6"
          >
            <Btn variant="outline" size="md" type="submit" className="w-full">
              Sign out
            </Btn>
          </form>
        </div>
      </div>
    </div>
  );
}
