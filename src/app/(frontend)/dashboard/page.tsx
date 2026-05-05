import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Dashboard now just funnels into the projects route
export default async function DashboardPage() {
  redirect('/projects')
}
