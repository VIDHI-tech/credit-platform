// lib/hf-adapter.ts
// The ONLY file that knows how the Higgsfield CLI works.
// If the CLI output format changes, edit only this file.
import { execSync } from 'child_process'

// The Next.js server process may not inherit your shell PATH, so the `higgsfield`
// binary can be "not found". Prepend the common install locations explicitly.
const CLI_ENV = {
  ...process.env,
  PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH ?? ''}`,
}

// --- Types matching the REAL CLI output ---

interface HFJob {
  id: string
  status: string
  display_name: string
  job_set_type: string
  result_url: string
  created_at: number // Unix float timestamp
  params: {
    prompt?: string
    [key: string]: unknown
  }
}

interface HFTransaction {
  display_name: string
  credits: number // negative for spend (e.g. -25), positive for grant
  action: string // "spend" or "grant"
  created_at: string // ISO string
}

// --- Our internal type ---

export interface Generation {
  externalId: string
  displayName: string
  jobSetType: string
  resultUrl: string
  mediaType: 'image' | 'video'
  prompt: string
  credits: number // always positive (0 for free models like Nano Banana)
  createdAt: string // ISO string
}

function detectMediaType(url: string): 'image' | 'video' {
  if (/\.(mp4|mov|webm|avi)$/i.test(url)) return 'video'
  return 'image'
}

function runCLI<T>(command: string): T {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000, // 30 second timeout
      env: CLI_ENV,
    })
    return JSON.parse(output) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`CLI command failed: ${command}\n${message}`)
  }
}

export function fetchHFGenerations(): Generation[] {
  // Step 1: Get all generation jobs
  const jobs = runCLI<HFJob[]>('higgsfield generate list --json')

  // Step 2: Get all credit transactions (spend only)
  const allTransactions = runCLI<HFTransaction[]>(
    'higgsfield account transactions --json'
  )
  const spendTransactions = allTransactions.filter((t) => t.action === 'spend')

  // Step 3: Match each job to its transaction by display_name + timestamp proximity.
  // Both are created within milliseconds of each other (~40ms observed in real data).
  // Use a 5-second window to be safe.
  const MATCH_WINDOW_MS = 5000

  const usedTransactionIndices = new Set<number>()

  const generations: Generation[] = jobs
    .filter((job) => job.status === 'completed')
    .map((job) => {
      const jobTimeMs = job.created_at * 1000 // Unix float → milliseconds

      // Find the closest matching transaction not yet used
      let bestMatchIndex = -1
      let bestMatchDiff = Infinity

      spendTransactions.forEach((tx, index) => {
        if (usedTransactionIndices.has(index)) return
        if (tx.display_name !== job.display_name) return

        const txTimeMs = new Date(tx.created_at).getTime()
        const diff = Math.abs(txTimeMs - jobTimeMs)

        if (diff < MATCH_WINDOW_MS && diff < bestMatchDiff) {
          bestMatchDiff = diff
          bestMatchIndex = index
        }
      })

      let credits = 0
      if (bestMatchIndex !== -1) {
        const tx = spendTransactions[bestMatchIndex]
        credits = Math.abs(tx.credits) // -25 → 25, 0 → 0
        usedTransactionIndices.add(bestMatchIndex) // mark as used
      }

      return {
        externalId: job.id,
        displayName: job.display_name,
        jobSetType: job.job_set_type,
        resultUrl: job.result_url,
        mediaType: detectMediaType(job.result_url),
        prompt: (job.params?.prompt || '').substring(0, 300).trim(),
        credits,
        createdAt: new Date(job.created_at * 1000).toISOString(),
      }
    })

  return generations
}

export function fetchHFBalance(): {
  email: string
  plan: string
  credits: number
} | null {
  try {
    const output = execSync('higgsfield account status', {
      encoding: 'utf-8',
      env: CLI_ENV,
    })
    // Output format: "email@example.com — plus plan, 789 credits"
    const match = output.match(/(.+?)\s*—\s*(.+?),\s*([\d.]+)\s*credits/)
    if (!match) return null
    return {
      email: match[1].trim(),
      plan: match[2].trim(),
      credits: parseFloat(match[3]),
    }
  } catch {
    return null
  }
}
