export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="h-8 w-64 rounded bg-surface-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-surface-muted" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-lg bg-surface-muted lg:col-span-2" />
        <div className="h-80 rounded-lg bg-surface-muted" />
      </div>
    </div>
  );
}
