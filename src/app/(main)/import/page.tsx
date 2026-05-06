import ImportClient from './ImportClient'

export default function ImportPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface)',
        paddingBottom: 104,
      }}
    >
      <ImportClient />
    </div>
  )
}
