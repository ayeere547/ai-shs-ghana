import type { Metadata } from "next";

import { Prose } from "@/components/marketing/blocks";

export const metadata: Metadata = { title: "Help centre" };

const FAQ = [
  ["How does a school join?", "Create a personal account, then use “Register a school”. Platform staff verify the school's details. Once approved you'll be notified and can complete the guided setup: branding, academic year and terms, programmes and classes, staff and settings."],
  ["Who can register a school?", "The headteacher, or a school administrator authorised by the headteacher. You'll be asked to confirm your authority, and the school stays inactive until it's verified."],
  ["How do teachers and staff get access?", "A school administrator adds them under Staff & members. People who already have an account are added immediately; others receive an invitation email to set a password."],
  ["Can other schools see our data?", "No. Each school is a separate tenant and the database itself blocks access across schools. Platform staff see your school's registration details and member counts, not your internal records."],
  ["How do students and parents sign in?", "Student and parent portals are being built. When available, schools will create student accounts and link verified parents to their children."],
  ["Is the platform free?", "Every school starts on the Free plan. Paid plans unlock features as they are released; sponsored and subsidised arrangements are possible for public schools."],
  ["I forgot my password.", "Use “Forgot password?” on the sign-in page. For security we always send the same response whether or not an account exists."],
];

export default function HelpPage() {
  return (
    <Prose title="Help centre">
      <p>Answers to the most common questions. More guides will be added as new modules are released.</p>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden">{q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Prose>
  );
}
