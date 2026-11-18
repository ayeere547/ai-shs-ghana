import type { Metadata } from "next";

import { Prose } from "@/components/marketing/blocks";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return (
    <Prose title="Terms and conditions" updated="17 November 2026">
      <p>These terms govern use of AI SHS Ghana by schools and the people they authorise. By creating an account you agree to them.</p>
      <h2>Accounts</h2>
      <ul>
        <li>Keep your sign-in details confidential. You are responsible for activity on your account.</li>
        <li>Only register a school you are authorised to represent. Schools are activated after verification.</li>
        <li>Schools are responsible for who they grant access to and for the accuracy of records they enter.</li>
      </ul>
      <h2>Acceptable use</h2>
      <ul>
        <li>Do not attempt to access another school&apos;s data or another person&apos;s account.</li>
        <li>Do not upload unlawful content or material you do not have the right to use.</li>
        <li>Do not use AI features to produce misleading academic records or to misrepresent AI-generated questions as official examination questions.</li>
      </ul>
      <h2>AI features</h2>
      <p>
        AI outputs can be wrong. They support teachers and learners but do not replace professional judgement. Grades and report comments drafted by
        AI must be reviewed by an authorised person before they are published.
      </p>
      <h2>Suspension</h2>
      <p>We may suspend a school account under defined procedures, such as misuse or unresolved verification issues. Reasons are recorded and shared with the school.</p>
      <h2>Independence</h2>
      <p>AI SHS Ghana is not affiliated with GES, NaCCA, WAEC or the Ministry of Education.</p>
    </Prose>
  );
}
