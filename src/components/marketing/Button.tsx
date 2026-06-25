import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium tracking-wide transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-bronze px-6 py-3",
  outline:
    "border border-ink/80 text-ink hover:border-bronze hover:text-bronze px-6 py-3",
  ghost:
    "text-ink hover:text-bronze underline-offset-4 decoration-bronze/60 hover:underline px-0 py-0 gap-1.5",
};

// On dark (ink/photo) sections: swap the base palette but keep the bronze hover.
const variantsOnDark: Record<Variant, string> = {
  primary: "bg-paper text-ink hover:bg-bronze hover:text-paper px-6 py-3",
  outline:
    "border border-paper/40 text-paper hover:border-bronze hover:text-bronze px-6 py-3",
  ghost:
    "text-paper hover:text-bronze underline-offset-4 decoration-bronze/60 hover:underline px-0 py-0 gap-1.5",
};

type BaseProps = {
  variant?: Variant;
  /** Use the on-dark palette for ink/photo sections (keeps bronze hover). */
  onDark?: boolean;
  className?: string;
  children: React.ReactNode;
};

type LinkProps = BaseProps & { href: string };

type BtnProps = BaseProps & {
  href?: undefined;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  disabled?: boolean;
};

export function Button(props: LinkProps | BtnProps) {
  const variant = props.variant ?? "primary";
  const classes = cn(
    base,
    (props.onDark ? variantsOnDark : variants)[variant],
    props.className,
  );

  if (props.href) {
    // Internal routes (/, #) use next/link; external/protocol links (http, tel,
    // mailto) render a plain <a>, with new-tab + rel only for http(s).
    const isInternal = props.href.startsWith("/") || props.href.startsWith("#");
    if (!isInternal) {
      const isHttp = /^https?:\/\//.test(props.href);
      return (
        <a
          href={props.href}
          {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={classes}
        >
          {props.children}
        </a>
      );
    }
    return (
      <Link href={props.href} className={classes}>
        {props.children}
      </Link>
    );
  }

  const { type = "button", onClick, disabled, children } = props as BtnProps;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
    >
      {children}
    </button>
  );
}
