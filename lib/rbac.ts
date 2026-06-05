// lib/rbac.ts — single source of truth for role-based UI access.
//
// To change what a role can do, flip the yes/no in ROLE_PERMISSIONS below.
// No other file should need editing for a permission tweak.
//
// Convention: keys are "<resource>.<action>". Every role lists every key
// so it is obvious at a glance what each role is allowed.

import type { Role } from './auth-helpers'

export type Permission =
  // Sidebar / top-level navigation
  | 'nav.reports'
  | 'nav.users'
  | 'nav.settings'
  // Clients
  | 'clients.view'
  | 'clients.create'
  | 'clients.edit'
  | 'clients.delete'
  | 'clients.changeStatus'
  // Works
  | 'works.view'
  | 'works.create'
  | 'works.viewAll' // false ⇒ user only sees their own works
  // Dashboard
  | 'dashboard.viewOrgWide' // false ⇒ creator-style personal dashboard
  // Users admin
  | 'users.view'
  | 'users.manageMembers'

export const ROLE_PERMISSIONS: Record<Role, Record<Permission, boolean>> = {
  master: {
    'nav.reports': true,
    'nav.users': true,
    'nav.settings': true,
    'clients.view': true,
    'clients.create': true,
    'clients.edit': true,
    'clients.delete': true,
    'clients.changeStatus': true,
    'works.view': true,
    'works.create': true,
    'works.viewAll': true,
    'dashboard.viewOrgWide': true,
    'users.view': true,
    'users.manageMembers': true,
  },
  manager: {
    'nav.reports': true,
    'nav.users': false,
    'nav.settings': false,
    'clients.view': true,
    'clients.create': true,
    'clients.edit': true,
    'clients.delete': false,
    'clients.changeStatus': true,
    'works.view': true,
    'works.create': true,
    'works.viewAll': true,
    'dashboard.viewOrgWide': true,
    'users.view': false,
    'users.manageMembers': false,
  },
  creator: {
    'nav.reports': false,
    'nav.users': false,
    'nav.settings': false,
    'clients.view': true,
    'clients.create': false,
    'clients.edit': false,
    'clients.delete': false,
    'clients.changeStatus': false,
    'works.view': true,
    'works.create': false,
    'works.viewAll': false,
    'dashboard.viewOrgWide': false,
    'users.view': false,
    'users.manageMembers': false,
  },
}

/** Does this role have the given permission? */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role][permission]
}
