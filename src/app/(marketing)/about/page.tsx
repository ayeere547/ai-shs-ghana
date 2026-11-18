import type { Metadata } from "next";

import { Prose } from "@/components/marketing/blocks";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <Prose title="About AI SHS Ghana">
      <p>
        AI SHS Ghana is a digital platform for Ghanaian Senior High Schools. It brings school administration, teaching and learning tools, WASSCE
        preparation and parent communication together, so that schools spend less time on paperwork and more time on learners.
      </p>
      <h2>What we believe</h2>
      <ul>
        <li>Every school is different. Schools configure their own programmes, classes, calendar and branding.</li>
        <li>AI should build understanding. Our tutor explains and asks questions back; teachers stay in control of grades and reports.</li>
        <li>Children&apos;s data deserves the strongest protection. Each school&apos;s records are isolated and every administrative action is logged.</li>
        <li>Connectivity is uneven. We design for Android phones and low bandwidth first.</li>
      </ul>
      <h2>How we are building it</h2>
      <p>
        The platform is developed in phases, starting with secure foundations — school registration and verification, roles and permissions, and
        academic setup — before student records, learning tools and AI features. Our <a className="text-royal hover:underline" href="/features">features page</a> shows what is available today and what is in development.
      </p>
      <h2>Independence</h2>
      <p>
        AI SHS Ghana is an independent platform. It is not affiliated with, endorsed by, or operated on behalf of the Ghana Education Service, NaCCA,
        WAEC or the Ministry of Education, and figures shown on the platform are not official education statistics.
      </p>
    </Prose>
  );
}
