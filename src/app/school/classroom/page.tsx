import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnnouncementForm, MaterialForm } from "@/components/classroom/forms";
import { AnnouncementList, Discussion, MaterialList, type Announcement, type Material, type Post } from "@/components/classroom/views";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { signedUrls } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { pickPair, teachingPairs } from "@/lib/teaching";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Classroom" };

const TABS = [
  { key: "materials", label: "Materials" },
  { key: "announcements", label: "Announcements" },
  { key: "discussion", label: "Discussion" },
] as const;

export default async function TeacherClassroom({ searchParams }: { searchParams: Promise<{ pair?: string; tab?: string }> }) {
  const { session, school } = await requireSchool();
  if (!(school.permissions.has("classroom.teach") || school.permissions.has("classroom.manage"))) redirect("/school?denied=1");
  const params = await searchParams;
  const pairs = await teachingPairs(school, session.userId);
  const pair = pickPair(pairs, params.pair);
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "materials";

  if (!pair) {
    return (
      <>
        <PageHeader title="Classroom" />
        <Card><EmptyState icon={BookOpen} title="No classes to teach yet">Ask an administrator to link your sign-in to your staff record and add your teaching assignments.</EmptyState></Card>
      </>
    );
  }

  const supabase = await createClient();
  const href = (t: string) => `/school/classroom?pair=${pair.key}&tab=${t}`;
  const writable = school.schoolStatus === "active";

  let body: React.ReactNode = null;
  if (tab === "materials") {
    const { data } = await supabase.from("learning_materials").select("id, title, kind, description, body, url, file_path, is_published, created_at").eq("class_id", pair.classId).eq("subject_id", pair.subjectId).order("created_at", { ascending: false }).returns<Material[]>();
    const files = await signedUrls(supabase, (data ?? []).map((m) => m.file_path));
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card><MaterialList materials={data ?? []} files={files} manage={writable} /></Card>
        {writable && <Card className="self-start"><CardHeader title="Add material" /><CardBody><MaterialForm classId={pair.classId} subjectId={pair.subjectId} /></CardBody></Card>}
      </div>
    );
  } else if (tab === "announcements") {
    const { data } = await supabase.from("announcements").select("id, title, body, is_urgent, created_at, class_id, audience").eq("class_id", pair.classId).order("created_at", { ascending: false }).limit(50).returns<Announcement[]>();
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card><CardHeader title={`Announcements for ${pair.className}`} description="Visible to every student in the class." /><AnnouncementList items={data ?? []} canDelete={() => writable} /></Card>
        {writable && <Card className="self-start"><CardHeader title="New class announcement" /><CardBody><AnnouncementForm classId={pair.classId} subjectId={pair.subjectId} /></CardBody></Card>}
      </div>
    );
  } else {
    const [{ data: posts }, { data: names }] = await Promise.all([
      supabase.from("classroom_posts").select("id, parent_id, author_id, body, is_hidden, created_at").eq("class_id", pair.classId).eq("subject_id", pair.subjectId).order("created_at", { ascending: false }).limit(200).returns<Post[]>(),
      supabase.rpc("classroom_names", { p_class: pair.classId, p_subject: pair.subjectId }),
    ]);
    body = (
      <Card>
        <CardBody>
          <Discussion
            posts={posts ?? []}
            names={new Map(((names ?? []) as { user_id: string; display_name: string }[]).map((n) => [n.user_id, n.display_name]))}
            me={session.userId}
            classId={pair.classId}
            subjectId={pair.subjectId}
            moderate
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Classroom" description={`${pair.className} · ${pair.subjectName}`} />
      <form className="mb-4 flex gap-3">
        <Select name="pair" defaultValue={pair.key} aria-label="Class and subject" className="sm:w-72">
          {pairs.map((p) => <option key={p.key} value={p.key}>{p.className} · {p.subjectName}</option>)}
        </Select>
        <input type="hidden" name="tab" value={tab} />
        <button type="submit" className={buttonClass("secondary")}>Open</button>
      </form>
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Classroom sections">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} aria-current={t.key === tab ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", t.key === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
