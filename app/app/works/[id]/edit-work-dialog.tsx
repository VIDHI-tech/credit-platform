'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Member {
  user_id: string
  full_name: string
  role: string
}
interface VideoType {
  id: string
  name: string
}
interface Industry {
  id: string
  name: string
}

interface WorkData {
  id: string
  title: string | null
  creator_id: string
  video_type: string | null
  industry: string | null
  max_credits: number | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  notes: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  work: WorkData
}

// Get today's date in YYYY-MM-DD format (no past dates allowed)
function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function EditWorkDialog({ open, onOpenChange, work }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(work.title || '')
  const [creatorId, setCreatorId] = useState(work.creator_id)
  const [videoType, setVideoType] = useState(work.video_type || '')
  const [addingVideoType, setAddingVideoType] = useState(false)
  const [newVideoTypeName, setNewVideoTypeName] = useState('')
  const [savingVideoType, setSavingVideoType] = useState(false)
  const [industry, setIndustry] = useState(work.industry || '')
  const [addingIndustry, setAddingIndustry] = useState(false)
  const [newIndustryName, setNewIndustryName] = useState('')
  const [savingIndustry, setSavingIndustry] = useState(false)
  const [maxCredits, setMaxCredits] = useState(
    work.max_credits !== null ? String(work.max_credits) : ''
  )
  const [startDate, setStartDate] = useState(work.start_date || '')
  const [endDate, setEndDate] = useState(work.end_date || '')
  const [startTime, setStartTime] = useState(work.start_time || '')
  const [endTime, setEndTime] = useState(work.end_time || '')
  const [notes, setNotes] = useState(work.notes || '')

  const [members, setMembers] = useState<Member[]>([])
  const [videoTypes, setVideoTypes] = useState<VideoType[]>([])
  const [industries, setIndustries] = useState<Industry[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const [{ data: m }, { data: vt }, { data: ind }] = await Promise.all([
        supabase
          .from('memberships')
          .select('user_id, full_name, role')
          .eq('status', 'active'),
        supabase.from('video_types').select('id, name').order('name'),
        supabase.from('industries').select('id, name').order('name'),
      ])
      if (!cancelled) {
        setMembers(m || [])
        setVideoTypes(vt || [])
        setIndustries(ind || [])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open])

  async function handleAddVideoType() {
    if (!newVideoTypeName.trim() || savingVideoType) return
    setSavingVideoType(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: membership } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!membership) return

      const { data, error } = await supabase
        .from('video_types')
        .insert({
          org_id: membership.org_id,
          name: newVideoTypeName.trim(),
          created_by: user.id,
        })
        .select('id, name')
        .single()

      if (error) {
        setError(error.message.includes('duplicate') ? 'Type already exists' : error.message)
        return
      }
      if (data) {
        setVideoTypes((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setVideoType(data.name)
        setAddingVideoType(false)
        setNewVideoTypeName('')
        setError(null)
      }
    } finally {
      setSavingVideoType(false)
    }
  }

  async function handleAddIndustry() {
    if (!newIndustryName.trim() || savingIndustry) return
    setSavingIndustry(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: membership } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!membership) return

      const { data, error } = await supabase
        .from('industries')
        .insert({
          org_id: membership.org_id,
          name: newIndustryName.trim(),
          created_by: user.id,
        })
        .select('id, name')
        .single()

      if (error) {
        setError(error.message.includes('duplicate') ? 'Industry already exists' : error.message)
        return
      }
      if (data) {
        setIndustries((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setIndustry(data.name)
        setAddingIndustry(false)
        setNewIndustryName('')
        setError(null)
      }
    } finally {
      setSavingIndustry(false)
    }
  }

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/works/${work.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          creator_id: creatorId,
          video_type: videoType || null,
          industry: industry || null,
          max_credits: maxCredits ? parseFloat(maxCredits) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Update failed')
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Work</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Update work details. Changes save immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-neutral-300">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            />
          </div>

          <div>
            <Label className="text-neutral-300">Creator</Label>
            <Select value={creatorId} onValueChange={(v) => setCreatorId(v as string)}>
              <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
                <SelectValue>
                  {(v) => {
                    const val = v as string | null
                    if (!val) return 'Pick a team member'
                    const m = members.find((x) => x.user_id === val)
                    return m ? m.full_name : val
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name}{' '}
                    <span className="text-neutral-500 text-xs capitalize">· {m.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">Video Type</Label>
              {!addingVideoType ? (
                <Select value={videoType} onValueChange={(v) => {
                  const val = v as string
                  if (val === '__add') setAddingVideoType(true)
                  else setVideoType(val)
                }}>
                  <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {videoTypes.map((vt) => (
                      <SelectItem key={vt.id} value={vt.name}>
                        {vt.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__add" className="text-lime-400">
                      + Add new type
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newVideoTypeName}
                    onChange={(e) => setNewVideoTypeName(e.target.value)}
                    placeholder="e.g. Reel, Story"
                    className="bg-neutral-900 border-neutral-700 text-white flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddVideoType()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddVideoType}
                    disabled={savingVideoType || !newVideoTypeName.trim()}
                    className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    {savingVideoType ? 'Adding…' : 'Add'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingVideoType}
                    onClick={() => {
                      setAddingVideoType(false)
                      setNewVideoTypeName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label className="text-neutral-300">Industry</Label>
              {!addingIndustry ? (
                <Select value={industry} onValueChange={(v) => {
                  const val = v as string
                  if (val === '__add_industry') setAddingIndustry(true)
                  else setIndustry(val)
                }}>
                  <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {industries.map((ind) => (
                      <SelectItem key={ind.id} value={ind.name}>
                        {ind.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__add_industry" className="text-lime-400">
                      + Add new industry
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newIndustryName}
                    onChange={(e) => setNewIndustryName(e.target.value)}
                    placeholder="e.g. Food & Beverage"
                    className="bg-neutral-900 border-neutral-700 text-white flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddIndustry()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddIndustry}
                    disabled={savingIndustry || !newIndustryName.trim()}
                    className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    {savingIndustry ? 'Adding…' : 'Add'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingIndustry}
                    onClick={() => {
                      setAddingIndustry(false)
                      setNewIndustryName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-neutral-300">Max Credits</Label>
            <Input
              type="number"
              step="0.1"
              value={maxCredits}
              onChange={(e) => setMaxCredits(e.target.value)}
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={getTodayDateString()}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
            <div>
              <Label className="text-neutral-300">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={getTodayDateString()}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
            <div>
              <Label className="text-neutral-300">End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-neutral-300">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md bg-neutral-900 border border-neutral-700 text-white px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
