"use client";

import { useActionState, useState } from "react";

import { updateBranding, updateSchoolProfile, updateSchoolSettings } from "@/app/school/settings/actions";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Field, Input, Textarea } from "@/components/ui/primitives";
import type { FormState } from "@/lib/validation/auth";

const initial: FormState = {};

export type SchoolProfile = {
  address: string;
  district: string;
  email: string;
  phone: string;
  website: string | null;
  headmaster_name: string;
  description: string | null;
  public_listing: boolean;
};

export function SchoolProfileForm({ school, disabled }: { school: SchoolProfile; disabled?: boolean }) {
  const [state, action] = useActionState(updateSchoolProfile, initial);
  const v = (name: string, fallback: string | null) => {
    const e = state.values?.[name];
    return (Array.isArray(e) ? e[0] : e) ?? fallback ?? "";
  };
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Address" htmlFor="address" error={state.errors?.address}>
            <Input id="address" name="address" defaultValue={v("address", school.address)} />
          </Field>
        </div>
        <Field label="District" htmlFor="district" error={state.errors?.district}>
          <Input id="district" name="district" defaultValue={v("district", school.district)} />
        </Field>
        <Field label="Headteacher" htmlFor="headmasterName" error={state.errors?.headmasterName}>
          <Input id="headmasterName" name="headmasterName" defaultValue={v("headmasterName", school.headmaster_name)} />
        </Field>
        <Field label="School email" htmlFor="email" error={state.errors?.email}>
          <Input id="email" name="email" type="email" defaultValue={v("email", school.email)} />
        </Field>
        <Field label="Telephone" htmlFor="phone" error={state.errors?.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={v("phone", school.phone)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Website (optional)" htmlFor="website" error={state.errors?.website}>
            <Input id="website" name="website" defaultValue={v("website", school.website)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Public description (optional)" htmlFor="description" error={state.errors?.description}>
            <Textarea id="description" name="description" defaultValue={v("description", school.description)} maxLength={1000} />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="publicListing" defaultChecked={state.values ? state.values.publicListing === "on" : school.public_listing} className="mt-0.5 h-4 w-4 accent-[var(--royal)]" />
          <span>
            List this school in the public directory
            <span className="block text-xs text-muted-foreground">Shows name, logo, region, district, type, programmes, description, website, email and phone. No student or staff data is ever public.</span>
          </span>
        </label>
      </fieldset>
      {!disabled && <SubmitButton>Save profile</SubmitButton>}
      <p className="text-xs text-muted-foreground">The official name and school code can only be changed by platform staff after re-verification.</p>
    </form>
  );
}

export function BrandingForm({ branding, logoUrl, disabled }: { branding: { primary_color: string; secondary_color: string; motto: string | null }; logoUrl: string | null; disabled?: boolean }) {
  const [state, action] = useActionState(updateBranding, initial);
  const [primary, setPrimary] = useState(branding.primary_color);
  const [secondary, setSecondary] = useState(branding.secondary_color);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <fieldset disabled={disabled} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="Current school logo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
          </div>
          <Field label="Logo" htmlFor="logo" error={state.errors?.logo} hint="PNG, JPEG or WebP, up to 1 MB. Square images work best.">
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { name: "primaryColor", label: "Primary colour", value: primary, set: setPrimary },
            { name: "secondaryColor", label: "Secondary colour", value: secondary, set: setSecondary },
          ].map((c) => (
            <Field key={c.name} label={c.label} htmlFor={c.name} error={state.errors?.[c.name]}>
              <div className="flex gap-2">
                <input type="color" value={c.value} onChange={(e) => c.set(e.target.value)} aria-label={`${c.label} picker`} className="h-10 w-12 cursor-pointer rounded-md border border-border bg-surface p-1" />
                <Input id={c.name} name={c.name} value={c.value} onChange={(e) => c.set(e.target.value)} pattern="^#[0-9a-fA-F]{6}$" />
              </div>
            </Field>
          ))}
        </div>
        <Field label="Motto (optional)" htmlFor="motto" error={state.errors?.motto}>
          <Input id="motto" name="motto" defaultValue={branding.motto ?? ""} maxLength={160} />
        </Field>
        <div className="overflow-hidden rounded-md border border-border" aria-label="Preview">
          <div className="px-4 py-3 text-sm font-semibold text-white" style={{ background: /^#[0-9a-f]{6}$/i.test(primary) ? primary : undefined }}>Report card header preview</div>
          <div className="h-1.5" style={{ background: /^#[0-9a-f]{6}$/i.test(secondary) ? secondary : undefined }} />
        </div>
      </fieldset>
      {!disabled && <SubmitButton>Save branding</SubmitButton>}
    </form>
  );
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export function SchoolSettingsForm({
  settings,
  disabled,
}: {
  settings: { form_levels: number; period_minutes: number; school_days: number[]; parent_portal_enabled: boolean; student_portal_enabled: boolean };
  disabled?: boolean;
}) {
  const [state, action] = useActionState(updateSchoolSettings, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Number of form levels" htmlFor="formLevels" error={state.errors?.formLevels} hint="Ghanaian SHS uses Forms 1–3; adjust if your structure differs.">
            <Input id="formLevels" name="formLevels" type="number" min={1} max={6} defaultValue={settings.form_levels} />
          </Field>
          <Field label="Period length (minutes)" htmlFor="periodMinutes" error={state.errors?.periodMinutes}>
            <Input id="periodMinutes" name="periodMinutes" type="number" min={20} max={180} defaultValue={settings.period_minutes} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">School days</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm">
                <input type="checkbox" name="schoolDays" value={d.value} defaultChecked={settings.school_days.includes(d.value)} className="h-4 w-4 accent-[var(--royal)]" />
                {d.label}
              </label>
            ))}
          </div>
          {state.errors?.schoolDays && <p className="mt-1 text-xs text-danger">{state.errors.schoolDays[0]}</p>}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="studentPortal" defaultChecked={settings.student_portal_enabled} className="h-4 w-4 accent-[var(--royal)]" /> Enable the student portal (Phase 3)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="parentPortal" defaultChecked={settings.parent_portal_enabled} className="h-4 w-4 accent-[var(--royal)]" /> Enable the parent portal (Phase 5)
        </label>
      </fieldset>
      {!disabled && <SubmitButton>Save settings</SubmitButton>}
    </form>
  );
}
