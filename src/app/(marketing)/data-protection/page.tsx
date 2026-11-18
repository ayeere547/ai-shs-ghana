import type { Metadata } from "next";

import { Prose } from "@/components/marketing/blocks";

export const metadata: Metadata = { title: "Data protection" };

export default function DataProtectionPage() {
  return (
    <Prose title="Data protection statement" updated="17 November 2026">
      <p>How AI SHS Ghana protects school, student, staff and parent data in practice.</p>
      <h2>Separation between schools</h2>
      <p>
        Every school is an isolated tenant. Access is decided by row-level security rules inside the database, based on the signed-in person&apos;s
        verified membership — not by what a web page or request claims. Changing a link or request cannot reveal another school&apos;s records.
      </p>
      <h2>Least privilege</h2>
      <p>
        Sixteen school roles and five platform roles each carry specific permissions. People can only assign roles at or below their own level, and
        nobody can change their own access. Platform staff do not have general access to schools&apos; internal records.
      </p>
      <h2>Accountability</h2>
      <p>Verification decisions, suspensions, role changes and configuration changes are written to an append-only audit log that schools can read.</p>
      <h2>Minimisation and purpose</h2>
      <p>We collect what each feature needs and use it for that purpose. National figures are aggregated and contain no identifiable student data.</p>
      <h2>Requests</h2>
      <p>Requests to access, correct or delete personal data are handled with the school that holds the record, in line with Act 843.</p>
    </Prose>
  );
}
