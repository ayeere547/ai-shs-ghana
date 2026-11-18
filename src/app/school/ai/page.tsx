import type { Metadata } from "next";
import Link from "next/link";

import { LessonPlanTool, NotesTool, QuestionTool } from "@/components/ai/tools";
import { Alert, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { aiAccess } from "@/lib/ai/service";
import { requireSchoolPermission } from "@/lib/auth/session";
import { teachingPairs } from "@/lib/teaching";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "AI teaching assistant" };

const TABS = [
  { key: "lesson", label: "Lesson planner" },
  { key: "notes", label: "Notes generator" },
  { key: "questions", label: "Question generator" },
] as const;

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { session, school } = await requireSchoolPermission("ai.teacher_tools");
  const wanted = (await searchParams).tab;
  const tab = TABS.some((t) => t.key === wanted) ? wanted! : "lesson";
  const [access, pairs] = await Promise.all([aiAccess(school.schoolId, "teacher"), teachingPairs(school, session.userId)]);
  const subjects = [...new Map(pairs.map((p) => [p.subjectId, p.subjectName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const pairOpts = pairs.map((p) => ({ value: p.key, label: `${p.className} · ${p.subjectName}` }));

  return (
    <>
      <PageHeader
        title="AI teaching assistant"
        description="Drafts grounded in your school's knowledge base. Everything is a draft: you edit and approve it, and nothing reaches students until you publish it."
        actions={<Link href="/school/report-comments" className="text-sm font-medium text-royal hover:underline">Report comments →</Link>}
      />
      {!access.ok && <Alert tone="warning" className="mb-4">{access.reason}</Alert>}
      {access.ok && access.quota.limit !== null && <p className="mb-4 text-xs text-muted-foreground">School AI allowance this month: {access.quota.used} of {access.quota.limit} requests used.</p>}
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Tools">
        {TABS.map((t) => <Link key={t.key} href={`/school/ai?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", t.key === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>)}
      </nav>
      <Card>
        <CardBody>
          {!subjects.length ? (
            <p className="text-sm text-muted-foreground">You have no teaching assignments yet, so there are no subjects to work with.</p>
          ) : tab === "lesson" ? (
            <LessonPlanTool subjects={subjects} pairs={pairOpts} />
          ) : tab === "notes" ? (
            <NotesTool subjects={subjects} pairs={pairOpts} />
          ) : (
            <QuestionTool subjects={subjects} />
          )}
        </CardBody>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">The marking assistant appears beside written answers when you mark exams and assignments.</p>
    </>
  );
}
