'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Atom, LayoutDashboard, RefreshCw, Users, LogOut } from 'lucide-react'

import { createClient } from '@/lib/supabase-browser'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type Role = 'master' | 'manager' | 'creator'

export function AppSidebar({
  orgName,
  role,
  fullName,
}: {
  orgName: string
  role: Role
  fullName: string
}) {
  const pathname = usePathname()
  const router = useRouter()

  const nav = [
    { title: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    { title: 'Sync & Assign', href: '/app/sync', icon: RefreshCw },
  ]
  if (role === 'master') {
    nav.push({ title: 'Users', href: '/app/users', icon: Users })
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-lime-400 text-black">
            <Atom className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-white">Eigen</div>
            <div className="text-xs text-neutral-500 truncate max-w-[150px]">
              {orgName}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {nav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={
                    pathname === item.href ||
                    pathname.startsWith(item.href + '/')
                  }
                  tooltip={item.title}
                  render={<Link href={item.href} />}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1.5">
          <div className="text-sm font-medium text-white truncate">
            {fullName}
          </div>
          <div className="text-xs text-neutral-500 capitalize">{role}</div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Sign out"
              className="text-neutral-400"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
