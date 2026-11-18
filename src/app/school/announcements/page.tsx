import type { Metadata } from "next";

import { AnnouncementForm } from "@/components/classroom/forms";
import { AnnouncementList, type Announcement } from "@/components/classroom/views";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const { school } = await requireSchool();
  const supabase = await createClient();
  const { data } = await supabase.from("announcements").select("id, title, body, is_urgent, created_at, class_id, audience").eq("school_id", school.schoolId).is("class_id", null).order("created_at", { ascending: false }).limit(100).returns<Announcement[]>();
  const canPost = school.permissions.has("announcements.manage") && school.schoolStatus === "active";
  return (
    <>
      <PageHeader title="Announcements" description="School-wide notices. Class announcements live in each classroom." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card><AnnouncementList items={data ?? []} canDelete={() => canPost} /></Card>
        {canPost && (
          <Card className="self-start">
            <CardHeader title="New announcement" description="Shown on dashboards and in the student portal for the audience you choose." />
            <CardBody><AnnouncementForm schoolWide /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
