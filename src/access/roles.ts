/**
 * @module roles
 * @description Role-based access control (RBAC) helpers for Payload CMS collections.
 * Defines a 4-tier role hierarchy: super_admin > admin > developer > viewer.
 * Exports Payload Access functions (superAdminAccess, adminOrAboveAccess, etc.)
 * and owner-scoped access for multi-tenant record isolation.
 */

import type { Access, FieldAccess } from 'payload'

export type Role = 'super_admin' | 'admin' | 'developer' | 'viewer'

export const ROLES: Role[] = ['super_admin', 'admin', 'developer', 'viewer']

interface UserWithRole {
  id?: number
  role?: string
}

/** Type guard: extract role from a request's user */
const getUserRole = (user: UserWithRole | null | undefined): Role | undefined =>
  user?.role as Role | undefined

/** Check helpers */
export const isSuperAdmin = (user: UserWithRole | null | undefined): boolean =>
  getUserRole(user) === 'super_admin'
export const isAdminOrAbove = (user: UserWithRole | null | undefined): boolean => {
  const role = getUserRole(user)
  return role === 'super_admin' || role === 'admin'
}
export const isDeveloperOrAbove = (user: UserWithRole | null | undefined): boolean => {
  const role = getUserRole(user)
  return role === 'super_admin' || role === 'admin' || role === 'developer'
}
export const isViewerOrAbove = (user: UserWithRole | null | undefined): boolean => {
  const role = getUserRole(user)
  return role !== undefined
}

/**
 * Payload Access functions
 * These return `Access` compatible functions for collection-level access.
 */
export const superAdminAccess: Access = ({ req: { user } }) => isSuperAdmin(user)

export const adminOrAboveAccess: Access = ({ req: { user } }) => isAdminOrAbove(user)

export const developerOrAboveAccess: Access = ({ req: { user } }) => isDeveloperOrAbove(user)

export const anyLoggedInAccess: Access = ({ req: { user } }) => isViewerOrAbove(user)

/**
 * Owner-scoped access — users see only their own records + unowned legacy records.
 * Admins see everything. Requires the collection to have an `owner` relationship field.
 */
export const ownerOrAdminAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAdminOrAbove(user as UserWithRole)) return true
  // Regular users: own records + legacy unowned records
  return {
    or: [
      { owner: { equals: (user as UserWithRole).id } },
      { owner: { exists: false } },
    ],
  }
}

/** Field-level access for the role field — only super_admin can change roles */
export const roleFieldAccess: FieldAccess = ({ req: { user } }) => isSuperAdmin(user)
