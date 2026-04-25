import type { CollectionConfig } from 'payload'
import { ROLES, superAdminAccess, anyLoggedInAccess, roleFieldAccess } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    create: superAdminAccess,
    read: anyLoggedInAccess,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'super_admin') return true
      // Users can update themselves
      return { id: { equals: user.id } }
    },
    delete: superAdminAccess,
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'viewer',
      options: ROLES.map((role) => ({ label: role.replace('_', ' ').toUpperCase(), value: role })),
      access: {
        update: roleFieldAccess,
      },
    },
  ],
}
