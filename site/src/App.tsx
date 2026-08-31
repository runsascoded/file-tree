import { Link, Route, Routes } from 'react-router-dom'
import { OgPreview } from './routes/OgPreview'
import { Home } from './routes/Home'
import { MockDemo } from './routes/MockDemo'
import { HttpDemo } from './routes/HttpDemo'
import { S3Demo } from './routes/S3Demo'
import { R2Demo } from './routes/R2Demo'
import { GcsDemo } from './routes/GcsDemo'
import { SqlStub } from './routes/SqlStub'

export function App() {
  return (
    <>
      <header>
        <h1><Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>@rdub/file-tree</Link></h1>
        <nav>
          <Link to="/mock">MockStore</Link>
          <Link to="/http">HttpStore</Link>
          <Link to="/s3">S3</Link>
          <Link to="/r2">R2</Link>
          <Link to="/gcs">GCS</Link>
          <a href="https://github.com/runsascoded/file-tree" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mock" element={<MockDemo />} />
          <Route path="/mock/*" element={<MockDemo />} />
          <Route path="/http" element={<HttpDemo />} />
          <Route path="/http/*" element={<HttpDemo />} />
          <Route path="/s3" element={<S3Demo />} />
          <Route path="/s3/:slug/*" element={<S3Demo />} />
          <Route path="/r2" element={<R2Demo />} />
          <Route path="/r2/:slug/*" element={<R2Demo />} />
          <Route path="/gcs" element={<GcsDemo />} />
          <Route path="/gcs/:slug/*" element={<GcsDemo />} />
          <Route path="/sql" element={<SqlStub />} />
          <Route path="/og" element={<OgPreview />} />
          <Route path="/og/*" element={<OgPreview />} />
        </Routes>
      </main>
    </>
  )
}
