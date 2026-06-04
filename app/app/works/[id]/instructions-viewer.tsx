// app/app/works/[id]/instructions-viewer.tsx — render .md/.txt content inline.
import { createClient } from '@/lib/supabase-server'

export async function InstructionsViewer({ path }: { path: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('work-instructions')
    .download(path)

  if (error || !data) {
    return (
      <div className="p-4 text-neutral-500 text-sm">
        Could not load instructions ({error?.message || 'unknown'})
      </div>
    )
  }

  const content = await data.text()
  const filename = path.split('/').pop()

  return (
    <div>
      <div className="px-4 py-2 bg-black/50 text-xs text-neutral-500 border-b border-neutral-800">
        {filename}
      </div>
      <pre className="p-4 text-sm text-neutral-300 whitespace-pre-wrap font-mono max-h-96 overflow-auto">
        {content}
      </pre>
    </div>
  )
}
