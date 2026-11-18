import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

/** One secure sign-in for every role; the portal a user lands in is decided by their verified roles, not by this choice. */
const AUDIENCES = {
  school: { label: "School staff", hint: "Headteachers, administrators, teachers and other school staff." },
  student: { label: "Student", hint: "Use the account your school created for you." },
  parent: { label: "Parent", hint: "Use the account linked to your child by the school." },
  platform: { label: "Platform", hint: "AI SHS Ghana platform staff only." },
} as const;

type Audience = keyof typeof AUDIENCES;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; as?: string }> }) {
  const { next, error, as } = await searchParams;
  const audience: Audience = as && as in AUDIENCES ? (as as Audience) : "school";
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-md bg-surface-muted p-1 text-xs font-medium" role="tablist" aria-label="Who is signing in">
        {(Object.keys(AUDIENCES) as Audience[]).map((key) => (
          <Link
            key={key}
            role="tab"
            aria-selected={key === audience}
            href={{ pathname: "/login", query: { as: key, ...(next ? { next } : {}) } }}
            className={cn("rounded px-2 py-1.5 text-center", key === audience ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {AUDIENCES[key].label}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{AUDIENCES[audience].hint}</p>
      {error === "link" && (
        <Alert tone="warning" className="mt-6">
          That sign-in link is invalid or has expired. Request a new one.
        </Alert>
      )}
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New school?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account and register it
        </Link>
      </p>
    </div>
  );
}
