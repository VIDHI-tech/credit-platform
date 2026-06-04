import type { ReactNode } from 'react'

import { AppSidebar } from '@/components/app-sidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delay={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-black">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 px-4">
            <SidebarTrigger className="text-neutral-400" />
            <Separator
              orientation="vertical"
              className="mx-1 h-5 bg-neutral-800"
            />
            <span className="text-sm font-medium text-neutral-300">
              Credit Dashboard
            </span>
          </header>
          <div className="flex-1 overflow-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
