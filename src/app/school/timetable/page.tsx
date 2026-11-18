import { CalendarDays, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { GenerateForm, SlotForm } from "@/components/timetable/forms";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { labelFrom, pick, schoolLookups } from "@/lib/school/lookups";
import { staffName } from "@/lib/staff/schema";
import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES } from "@/lib/timetable/generate";
import { cn } from "@/lib/utils";

import { clearSlot } from "./actions";

export const metadata: Metadata = { title: "Timetable" };

type SlotRow = { id: string; class_id: string; day_of_week: number; period_id: string; subject_id: string; staff_id: string | null; room: string | null };

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ term?: string; class?: string; staff?: string; edit?: string }> }) {
  const { school } = await requireSchoolPermission("academics.read");
  const params = await searchParams;
  const l = await schoolLookups(school.schoolId);
  const supabase = await createClient();
  const [{ data: periods }, { data: staffRows }] = await Promise.all([
    supabase.from("timetable_periods").select("id, name, starts_at, ends_at, is_break").eq("school_id", school.schoolId).order("starts_at"),
    supabase.from("staff").select("id, title, first_name, last_name").eq("school_id", school.schoolId).eq("is_teaching", true).neq("employment_status", "left").order("last_name"),
  ]);
  const staffOptions = (staffRows ?? []).map((s) => ({ value: s.id, label: staffName(s) }));

  const termId = pick(l.terms, params.term, l.terms.find((t) => t.isCurrent)?.value);
  const byStaff = staffOptions.some((s) => s.value === params.staff) ? params.staff : undefined;
  const classId = byStaff ? undefined : pick(l.classes, params.class);
  const canManage = school.permissions.has("timetable.manage") && school.schoolStatus === "active";

  if (!termId || !periods?.length || (!classId && !byStaff)) {
    return (
      <>
        <PageHeader title="Timetable" />
        <Card>
          <EmptyState icon={CalendarDays} title="The timetable needs a little setup" action={<Link href="/school/academics?tab=periods" className={buttonClass("secondary", "sm")}>Open Academic setup</Link>}>
            Add at least one term, one class and the school day&apos;s periods under Academic setup.
          </EmptyState>
        </Card>
      </>
    );
  }

  let query = supabase.from("timetable_slots").select("id, class_id, day_of_week, period_id, subject_id, staff_id, room").eq("school_id", school.schoolId).eq("term_id", termId);
  query = byStaff ? query.eq("staff_id", byStaff) : query.eq("class_id", classId!);
  const [{ data: slots }, { data: assignments }] = await Promise.all([
    query.returns<SlotRow[]>(),
    classId ? supabase.from("teacher_assignments").select("subject_id").eq("class_id", classId) : Promise.resolve({ data: [] as { subject_id: string }[] }),
  ]);
  const at = new Map((slots ?? []).map((s) => [`${s.day_of_week}|${s.period_id}`, s]));
  const taught = new Set((assignments ?? []).map((a) => a.subject_id));
  const [editDay, editPeriod] = (params.edit ?? "").split(":");
  const editing = canManage && classId && l.schoolDays.includes(Number(editDay)) && periods.some((p) => p.id === editPeriod && !p.is_break) ? { day: Number(editDay), periodId: editPeriod } : null;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ term: termId, class: classId, staff: byStaff, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/school/timetable?${p}`;
  };
  const termLabel = labelFrom(l.terms, termId);

  return (
    <>
      <PageHeader title="Timetable" description={byStaff ? `Teaching timetable for ${labelFrom(staffOptions, byStaff)} · ${termLabel}` : `${labelFrom(l.classes, classId)} · ${termLabel}`} />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select name="term" defaultValue={termId} aria-label="Term" className="sm:w-56">
          {l.terms.map((t) => <option key={t.value} value={t.value}>{t.label}{t.isCurrent ? " (current)" : ""}</option>)}
        </Select>
        <Select name="class" defaultValue={classId ?? ""} aria-label="Class" className="sm:w-48">
          <option value="">— by teacher —</option>
          {l.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select name="staff" defaultValue={byStaff ?? ""} aria-label="Teacher" className="sm:w-56">
          <option value="">— by class —</option>
          {staffOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>Show</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-28 border-b border-border bg-surface-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period</th>
                  {l.schoolDays.map((d) => <th key={d} className="border-b border-l border-border bg-surface-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{DAY_NAMES[d].slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className={p.is_break ? "bg-surface-muted/50" : undefined}>
                    <td className="border-b border-border px-3 py-2 align-top">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{p.starts_at.slice(0, 5)}–{p.ends_at.slice(0, 5)}</p>
                    </td>
                    {p.is_break ? (
                      <td colSpan={l.schoolDays.length} className="border-b border-l border-border px-3 py-2 text-center text-xs uppercase tracking-wider text-muted-foreground">{p.name}</td>
                    ) : (
                      l.schoolDays.map((d) => {
                        const s = at.get(`${d}|${p.id}`);
                        const active = editing?.day === d && editing.periodId === p.id;
                        const body = s ? (
                          <>
                            <p className="font-medium leading-tight">{labelFrom(l.subjects, s.subject_id)}</p>
                            <p className="text-xs text-muted-foreground">{byStaff ? labelFrom(l.classes, s.class_id) : s.staff_id ? labelFrom(staffOptions, s.staff_id) : "No teacher"}{s.room ? ` · ${s.room}` : ""}</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">{canManage && classId ? "+ Add" : "—"}</span>
                        );
                        return (
                          <td key={d} className={cn("h-16 border-b border-l border-border p-0 align-top", active && "bg-royal-soft")}>
                            {canManage && classId ? (
                              <Link href={qs({ edit: `${d}:${p.id}` })} className="block h-full px-3 py-2 hover:bg-surface-muted" aria-label={`Edit ${DAY_NAMES[d]} ${p.name}`}>{body}</Link>
                            ) : (
                              <div className="px-3 py-2">{body}</div>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {canManage && (
          <div className="space-y-6">
            {editing && classId && (
              <Card>
                <CardHeader
                  title={`${DAY_NAMES[editing.day]}, ${periods.find((p) => p.id === editing.periodId)?.name}`}
                  description={labelFrom(l.classes, classId)}
                  action={<Link href={qs({})} className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted" aria-label="Close"><X className="h-4 w-4" /></Link>}
                />
                <CardBody className="space-y-3">
                  <SlotForm
                    key={params.edit}
                    termId={termId}
                    classId={classId}
                    day={editing.day}
                    periodId={editing.periodId}
                    subjects={l.subjects.map((s) => ({ ...s, taught: taught.has(s.value) }))}
                    current={at.get(`${editing.day}|${editing.periodId}`) ? { subjectId: at.get(`${editing.day}|${editing.periodId}`)!.subject_id, room: at.get(`${editing.day}|${editing.periodId}`)!.room } : undefined}
                  />
                  {at.get(`${editing.day}|${editing.periodId}`) && (
                    <form action={clearSlot}>
                      <input type="hidden" name="termId" value={termId} />
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="day" value={editing.day} />
                      <input type="hidden" name="periodId" value={editing.periodId} />
                      <ConfirmSubmit title="Clear this lesson?" description="The period becomes free for this class." confirmLabel="Clear">Clear lesson</ConfirmSubmit>
                    </form>
                  )}
                </CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title="Automatic generation" description="Builds the whole term from teaching assignments (periods per week), avoiding class and teacher clashes and spreading subjects across the week." />
              <CardBody><GenerateForm termId={termId} termLabel={termLabel} /></CardBody>
            </Card>
            <p className="text-xs text-muted-foreground">Class, teacher and room double-booking is blocked by the database, whether lessons are generated or edited by hand.</p>
          </div>
        )}
      </div>
    </>
  );
}
