import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BandForm, SchemeForm } from "@/components/results/forms";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { deleteBand, setDefaultScheme } from "../actions";

export const metadata: Metadata = { title: "Grading scheme" };

type Scheme = { id: string; name: string; is_default: boolean; grading_bands: { id: string; grade: string; min_score: number; max_score: number; remark: string | null }[] };

export default async function GradingPage() {
  const { school } = await requireSchoolPermission("assessments.manage");
  const supabase = await createClient();
  const { data: schemes } = await supabase.from("grading_schemes").select("id, name, is_default, grading_bands(id, grade, min_score, max_score, remark)").eq("school_id", school.schoolId).order("is_default", { ascending: false }).order("name").returns<Scheme[]>();
  const canWrite = school.schoolStatus === "active";

  return (
    <>
      <Link href="/school/results" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Results</Link>
      <PageHeader title="Grading scheme" description="Your school decides its grade bands. No national or WAEC scheme is assumed — enter the bands your school has approved." />
      <Alert tone="info" className="mb-6">The scheme marked “In use” grades every results sheet. Bands are percentages of the weighted term score.</Alert>
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {!schemes?.length && <Card><EmptyState title="No grading scheme yet">Create one with the form.</EmptyState></Card>}
          {schemes?.map((sc) => {
            const bands = [...sc.grading_bands].sort((a, b) => Number(b.min_score) - Number(a.min_score));
            return (
              <Card key={sc.id}>
                <CardHeader
                  title={sc.name}
                  action={sc.is_default ? <Badge tone="success">In use</Badge> : canWrite && (
                    <form action={setDefaultScheme}><input type="hidden" name="schemeId" value={sc.id} /><button type="submit" className={buttonClass("secondary", "sm")}>Use for results</button></form>
                  )}
                />
                {bands.length === 0 ? (
                  <EmptyState title="No grade bands yet" />
                ) : (
                  <Table>
                    <thead><tr><Th>Grade</Th><Th>Range (%)</Th><Th>Remark</Th>{canWrite && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
                    <tbody>
                      {bands.map((b) => (
                        <tr key={b.id}>
                          <Td className="font-semibold">{b.grade}</Td>
                          <Td className="tabular-nums">{Number(b.min_score)} – {Number(b.max_score)}</Td>
                          <Td className="text-muted-foreground">{b.remark ?? "—"}</Td>
                          {canWrite && (
                            <Td className="text-right">
                              <form action={deleteBand}><input type="hidden" name="bandId" value={b.id} /><ConfirmSubmit title={`Delete grade ${b.grade}?`} description="Results using this scheme will be regraded straight away." confirmLabel="Delete">Delete</ConfirmSubmit></form>
                            </Td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                {canWrite && <CardBody className="border-t border-border"><BandForm schemeId={sc.id} /></CardBody>}
              </Card>
            );
          })}
        </div>
        {canWrite && (
          <Card className="self-start">
            <CardHeader title="New scheme" />
            <CardBody><SchemeForm /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
