import type { Metadata } from "next";

import { Prose } from "@/components/marketing/blocks";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy policy" updated="17 November 2026">
      <p>
        This policy explains how AI SHS Ghana processes personal data. We follow the principles of Ghana&apos;s Data Protection Act, 2012 (Act 843):
        accountability, lawful processing, specified purpose, data minimisation, quality, security and the rights of data subjects.
      </p>
      <h2>Who is responsible</h2>
      <p>
        Each school decides what records it keeps about its students, staff and parents and acts as the data controller for those records. AI SHS
        Ghana processes that data on the school&apos;s behalf to provide the platform. For account data (your name, email and sign-in activity) we
        are the controller.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email address, optional phone number.</li>
        <li>School registration details submitted for verification.</li>
        <li>Records your school enters, such as classes, roles and — as modules are released — academic records.</li>
        <li>Security logs: sign-ins and administrative actions, kept in an audit log.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To provide and secure the platform and verify schools.</li>
        <li>To let authorised people in your school do their work, limited by their role.</li>
        <li>To send service notifications you need, such as verification decisions.</li>
      </ul>
      <p>We do not sell personal data. We do not use student conversations with AI features to train AI models without lawful authorisation and consent.</p>
      <h2>Children&apos;s data</h2>
      <p>
        Most students are minors. Their records are visible only to authorised staff of their own school and to parents or guardians the school has
        verified. Sensitive records such as health information are restricted to authorised personnel.
      </p>
      <h2>Your rights</h2>
      <p>
        You may ask to access or correct your personal data, or object to its processing. For records held by your school, contact the school first;
        we will support the school in responding.
      </p>
      <h2>Security and retention</h2>
      <p>
        Data is stored with access controls enforced in the database, encrypted connections and audit logging. We keep data only as long as needed for
        the purposes above or as required by law. See our <a className="text-royal hover:underline" href="/data-protection">data protection statement</a>.
      </p>
    </Prose>
  );
}
