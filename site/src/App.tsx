import { Link, Route, Routes } from 'react-router-dom'
import { Home } from './routes/Home'
import { MockDemo } from './routes/MockDemo'
import { HttpDemo } from './routes/HttpDemo'

export function App() {
  return (
    <>
      <header>
        <h1><Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>@rdub/file-tree</Link></h1>
        <nav>
          <Link to="/mock">MockStore</Link>
          <Link to="/http">HttpStore</Link>
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
        </Routes>
      </main>
    </>
  )
}
