export default function Loading() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="h-7 w-32 bg-neutral-800/60 rounded animate-pulse" />
      <div className="h-48 bg-neutral-900 border border-neutral-800 rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-neutral-900 border border-neutral-800 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}
