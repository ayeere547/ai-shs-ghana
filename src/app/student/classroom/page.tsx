import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnnouncementList, Discussion, MaterialList, type Announcement, type Material, type Post } from "@/components/classroom/views";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { signedUrls } from "@/lib/storage";
import { classSubjects, requireEnrolledStudent } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Classroom" };

export default async function StudentClassroom({ searchParams }: { searchParams: Promise<{ subject?: string; tab?: string }> }) {
  const { session, student } = await requireEnrolledStudent();
  const params = await searchParams;
  const subjects = await classSubjects(student.class_id);
  const subject = subjects.find((s) => s.value === params.subject) ?? subjects[0];
  const tab = params.tab === "discussion" ? "discussion" : "materials";
  if (!subject) return (<><PageHeader title="Classroom" /><Card><EmptyState icon={BookOpen} title="No subjects yet">Your teachers haven&apos;t been assigned to your class yet.</EmptyState></Card></>);

  const supabase = await createClient();
  const href = (s: string, t = tab) => `/student/classroom?subject=${s}&tab=${t}`;
  let body: React.ReactNode;
  if (tab === "materials") {
    const [{ data: materials }, { data: notices }] = await Promise.all([
      supabase.from("learning_materials").select("id, title, kind, description, body, url, file_path, is_published, created_at").eq("class_id", student.class_id).eq("subject_id", subject.value).order("created_at", { ascending: false }).returns<Material[]>(),
      supabase.from("announcements").select("id, title, body, is_urgent, created_at, class_id, audience").eq("class_id", student.class_id).or(`subject_id.is.null,subject_id.eq.${subject.value}`).order("created_at", { ascending: false }).limit(10).returns<Announcement[]>(),
    ]);
    const files = await signedUrls(supabase, (materials ?? []).map((m) => m.file_path));
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card><MaterialList materials={materials ?? []} files={files} /></Card>
        <Card className="self-start"><CardHeader title="Class announcements" /><AnnouncementList items={notices ?? []} /></Card>
      </div>
    );
  } else {
    const [{ data: posts }, { data: names }] = await Promise.all([
      supabase.from("classroom_posts").select("id, parent_id, author_id, body, is_hidden, created_at").eq("class_id", student.class_id).eq("subject_id", subject.value).order("created_at", { ascending: false }).limit(200).returns<Post[]>(),
      supabase.rpc("classroom_names", { p_class: student.class_id, p_subject: subject.value }),
    ]);
    body = <Card><CardBody><Discussion posts={posts ?? []} names={new Map(((names ?? []) as { user_id: string; display_name: string }[]).map((n) => [n.user_id, n.display_name]))} me={session.userId} classId={student.class_id} subjectId={subject.value} /></CardBody></Card>;
  }

  return (
    <>
      <PageHeader title="Classroom" description={`${student.className} · ${subject.label}`} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Subjects">
        {subjects.map((s) => (
          <Link key={s.value} href={href(s.value)} aria-current={s.value === subject.value ? "page" : undefined} className={cn("rounded-full border px-3 py-1 text-sm", s.value === subject.value ? "border-royal bg-royal-soft font-medium text-royal" : "border-border text-muted-foreground hover:text-foreground")}>{s.label}</Link>
        ))}
      </nav>
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Sections">
        {[["materials", "Materials"], ["discussion", "Discussion"]].map(([k, label]) => (
          <Link key={k} href={href(subject.value, k)} aria-current={k === tab ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", k === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>
        ))}
      </nav>
      {body}
    </>
  );
}
