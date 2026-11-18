"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Horizontal bar chart for a single categorical series (e.g. schools per region). */
export function HorizontalBars({ data, label, height = 420 }: { data: { name: string; value: number }[]; label: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`${label}: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--foreground)" }}
            formatter={(v) => [v as number, label]}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 3, 3, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A labelled proportion bar (e.g. public vs private) — readable without a legend. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        {total > 0 && parts.map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="flex-1 text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
