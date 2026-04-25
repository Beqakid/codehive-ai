import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import { redirect } from 'next/navigation'
import React from 'react'
import config from '@/payload.config'
import '../styles.css'

export const metadata = {
  title: 'Projects — CodeHive AI',
}

export default async function ProjectsPage() {
  const headers = await getHeaders()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const { user } = await payload.auth({ headers })

  if (!user) {
    redirect('/admin')
  }

  const projects = await payload.find({
    collection: 'projects',
    limit: 50,
    sort: '-createdAt',
    depth: 1,
  })

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>📁 Projects</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#666' }}>{projects.totalDocs} project{projects.totalDocs !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a href="/dashboard" style={linkBtnStyle}>Dashboard</a>
          <a href="/admin/collections/projects/create" style={{ ...linkBtnStyle, background: '#10b981' }}>+ New Project</a>
        </div>
      </div>

      {projects.docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '1.1rem', color: '#666', margin: 0 }}>No projects yet. Create your first one!</p>
          <a href="/admin/collections/projects/create" style={{ ...linkBtnStyle, display: 'inline-block', marginTop: '1rem', background: '#10b981' }}>
            + Create Project
          </a>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
          {projects.docs.map((project: any) => {
            const ownerEmail =
              typeof project.owner === 'object' && project.owner !== null
                ? project.owner.email
                : 'Unknown'
            return (
              <a
                key={project.id}
                href={`/projects/${project.id}`}
                style={{
                  display: 'block',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: '1.25rem',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{project.name}</h3>
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    background: project.status === 'active' ? '#dcfce7' : '#f3f4f6',
                    color: project.status === 'active' ? '#166534' : '#4b5563',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {project.status}
                  </span>
                </div>
                {project.description && (
                  <p style={{ margin: '0 0 0.75rem', color: '#666', fontSize: '0.9rem', lineHeight: 1.4 }}>
                    {project.description.length > 120
                      ? project.description.substring(0, 120) + '...'
                      : project.description}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#999' }}>
                  <span>Owner: {ownerEmail}</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
                {project.repoUrl && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#3b82f6' }}>
                    🔗 {project.repoUrl}
                  </div>
                )}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.5rem 1rem',
  background: '#3b82f6',
  color: '#fff',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: '0.85rem',
  fontWeight: 500,
}
