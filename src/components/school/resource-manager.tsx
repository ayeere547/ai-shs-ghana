import { Pencil } from "lucide-react";
import Link from "next/link";

import { deleteResource } from "@/app/school/academics/actions";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { RESOURCES, type ResourceDef, type ResourceKey } from "@/lib/school/resources";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

import { ResourceForm } from "./resource-form";

type Row = Record<string, unknown> & { id: string };

async function loadOptions(def: ResourceDef, schoolId: string) {
  const supabase = await createClient();
  const sources = [...new Set(def.fields.flatMap((f) => (f.optionsFrom ? [f.optionsFrom] : [])))];
  const entries = await Promise.all(
    sources.map(async (key) => {
      const src = RESOURCES[key];
      const { data } = await supabase.from(src.table).select("id, name").eq("school_id", schoolId).order(src.orderBy[0].column, { ascending: src.orderBy[0].ascending });
      return [key, (data ?? []).map((r) => ({ value: r.id as string, label: r.name as string }))] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<string, { value: string; label: string }[]>;
}

/**
 * Lists a school's records of one type and (for managers) offers add / edit / delete.
 * Rows are read with the user's session, so RLS limits them to the current school.
 */
export async function ResourceManager({ resource, schoolId, canManage, editId, hrefFor }: { resource: ResourceKey; schoolId: string; canManage: boolean; editId?: string; hrefFor: (editId?: string) => string }) {
  const def = RESOURCES[resource];
  const supabase = await createClient();
  let query = supabase.from(def.table).select("*").eq("school_id", schoolId);
  for (const o of def.orderBy) query = query.order(o.column, { ascending: o.ascending });
  const [{ data }, options] = await Promise.all([query.limit(500).returns<Row[]>(), loadOptions(def, schoolId)]);
  const rows = data ?? [];
  const editing = editId ? rows.find((r) => r.id === editId) : undefined;
  const listFields = def.fields.filter((f) => !f.hideInList);

  const display = (f: (typeof def.fields)[number], v: unknown) => {
    if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
    if (f.type === "checkbox") return v ? <Badge tone="info">{f.label.replace(/^(Current|Core) .*/, "$1")}</Badge> : <span className="text-muted-foreground">—</span>;
    if (f.type === "date") return formatDate(String(v));
    if (f.type === "time") return String(v).slice(0, 5);
    if (f.type === "select") return (f.options ?? options[f.optionsFrom ?? ""] ?? []).find((o) => o.value === v)?.label ?? "—";
    return String(v);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader title={def.plural} description={def.description} />
        {rows.length === 0 ? (
          <EmptyState title={`No ${def.plural.toLowerCase()} yet`}>{canManage ? `Add the first ${def.singular} using the form.` : `An administrator hasn't added any ${def.plural.toLowerCase()} yet.`}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                {listFields.map((f) => <Th key={f.name}>{f.label}</Th>)}
                {canManage && <Th className="text-right"><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.id === editId ? "bg-royal-soft/50" : undefined}>
                  {listFields.map((f, i) => <Td key={f.name} className={i === 0 ? "font-medium" : "text-muted-foreground"}>{display(f, r[f.name])}</Td>)}
                  {canManage && (
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={hrefFor(r.id)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground" aria-label={`Edit ${String(r.name)}`}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Link>
                        <form action={deleteResource}>
                          <input type="hidden" name="resource" value={resource} />
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmSubmit title={`Delete ${def.singular}?`} description={`“${String(r.name)}” will be removed. Linked records keep working but lose this link.`} confirmLabel="Delete">
                            Delete
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {canManage && (
        <Card className="self-start">
          <CardHeader title={editing ? `Edit ${def.singular}` : `Add ${def.singular}`} />
          <CardBody>
            <ResourceForm
              key={editing?.id ?? "new"}
              resource={resource}
              singular={def.singular}
              fields={def.fields}
              options={options}
              initial={editing}
              id={editing?.id}
              cancelHref={hrefFor()}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
