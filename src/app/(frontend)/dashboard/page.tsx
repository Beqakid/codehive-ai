import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import config from '@/payload.config'
import ParallelDashboard from '@/components/ParallelDashboard'
import CommandInterface from '@/components/CommandInterface'
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* Global Command Interface — top of dashboard */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-0.5 bg-gradient-to-r from-yellow-500 to-orange-500" />
            <h1 className="text-lg font-bold text-white tracking-tight">Command Center</h1>
          </div>
          <CommandInterface />
        </section>

        {/* Divider */}
        <div className="border-t border-gray-800" />

        {/* Parallel runs dashboard */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500" />
            <h2 className="text-lg font-bold text-white tracking-tight">Projects</h2>
            <span className="text-gray-500 text-sm">({projectList.length})</span>
          </div>
          <ParallelDashboard projects={projectList} />
        </section>
      </div>
    </div>
  )
}
