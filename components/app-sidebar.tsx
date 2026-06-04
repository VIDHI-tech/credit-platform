'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Atom,
  LayoutDashboard,
  Users,
  ChartColumn,
  Settings,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const mainNav = [{ title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }]

const soonNav = [
  { title: 'Clients', icon: Users },
  { title: 'Reports', icon: ChartColumn },
  { title: 'Settings', icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-lime-400 text-black">
            <Atom className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-white">Eigen</div>
            <div className="text-xs text-neutral-500">Credit attribution</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {mainNav.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href)}
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

        <SidebarGroup>
          <SidebarGroupLabel>Coming soon</SidebarGroupLabel>
          <SidebarMenu>
            {soonNav.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  disabled
                  tooltip={item.title}
                  className="opacity-50"
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-neutral-600">
                  soon
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-500">
          <span className="size-2 rounded-full bg-lime-400" />
          Higgsfield CLI · connected
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
