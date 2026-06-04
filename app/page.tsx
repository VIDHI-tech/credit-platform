// app/page.tsx
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center space-y-6 max-w-lg">
        <h1 className="text-7xl font-bold text-white tracking-tighter">
          Eigen
        </h1>
        <p className="text-neutral-300 text-lg">
          Every Higgsfield generation, resolved to the client it belongs to.
        </p>
        <p className="text-neutral-600 text-sm">
          <span className="text-lime-400">eigen</span> — the definite state a
          system collapses to once measured; that which is one&apos;s own.
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-block bg-lime-400 hover:bg-lime-300 text-black px-8 py-3 rounded-lg text-lg font-semibold transition-colors"
          >
            Get Started →
          </Link>
        </div>
      </div>
    </div>
  )
}
