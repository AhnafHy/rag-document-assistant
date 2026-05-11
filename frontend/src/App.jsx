import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Bot, FileText, Upload } from 'lucide-react'
import Chat from './pages/Chat'
import Documents from './pages/Documents'
import UploadPage from './pages/Upload'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="text-violet-600" size={22} />
              <span className="font-semibold text-gray-900">RAG Document Assistant</span>
            </div>
            <div className="flex items-center gap-6">
              <NavLink to="/" className={({ isActive }) =>
                `flex items-center gap-1.5 text-sm font-medium ${isActive ? 'text-violet-600' : 'text-gray-600 hover:text-gray-900'}`
              }>
                <Bot size={15} /> Chat
              </NavLink>
              <NavLink to="/documents" className={({ isActive }) =>
                `flex items-center gap-1.5 text-sm font-medium ${isActive ? 'text-violet-600' : 'text-gray-600 hover:text-gray-900'}`
              }>
                <FileText size={15} /> Documents
              </NavLink>
              <NavLink to="/upload" className={({ isActive }) =>
                `flex items-center gap-1.5 bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-violet-700 transition-colors`
              }>
                <Upload size={15} /> Upload
              </NavLink>
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/upload" element={<UploadPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}