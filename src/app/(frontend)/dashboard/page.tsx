import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import config from '@/payload.config'
import ParallelDashboard from '@/components/ParallelDashboard'
import '../styles.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Dashboard — CodeHive AI',
}

interface ProjectDoc {
  id: number
  name: string
  description?: string
  status: string
  repoUrl?: string
}

export default async function DashboardPage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect('/login')
  }

  const projects = await payload.find({
    collection: 'projects',
    limit: 100,
    sort: '-createdAt',
    depth: 0,
  })

  const projectList = projects.docs.map((p) => {
    const doc = p as unknown as ProjectDoc
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      status: doc.status,
      repoUrl: doc.repoUrl,
    }
  })

  return <ParallelDashboard projects={projectList} />
}
