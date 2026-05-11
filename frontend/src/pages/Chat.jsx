import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Send, Bot, FileText } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MessageBubble from '../components/MessageBubble'

const API = import.meta.env.VITE_API_URL

export default function Chat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 10))
  const bottomRef = useRef(null)

  const { data: documents } = useQuery({
    queryKey: ['documents'],
    queryFn: () => axios.get(`${API}/documents`).then(r => r.data)
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (documents && documents.length > 0) {
      const docParam = searchParams.get('doc')
      if (docParam) {
        const match = documents.find(d => d.filename === docParam)
        if (match && !selectedDoc) {
          setSelectedDoc(match)
          setMessages([{
            role: 'assistant',
            content: `Hi! I've loaded **${match.filename}**. Ask me anything about this document.`
          }])
        }
      }
    }
  }, [documents, searchParams])

  const sendMessage = async () => {
    if (!input.trim() || !selectedDoc || loading) return

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await axios.post(`${API}/chat`, {
        question: input,
        doc_id: selectedDoc.doc_id,
        session_id: sessionId
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-20">
        <Bot className="mx-auto mb-4 text-gray-300" size={48} />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">No documents yet</h2>
        <p className="text-gray-400 mb-6">Upload a PDF document to start chatting with it</p>
        <button
          onClick={() => navigate('/upload')}
          className="bg-violet-600 text-white px-6 py-2 rounded-lg hover:bg-violet-700 transition-colors text-sm font-medium"
        >
          Upload first document
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      {/* Document selector sidebar */}
      <div className="w-64 flex-shrink-0 overflow-y-auto">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Select document</p>
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.doc_id}
              onClick={() => {
                setSelectedDoc(doc)
                setMessages([{
                  role: 'assistant',
                  content: `Hi! I've loaded **${doc.filename}**. Ask me anything about this document.`
                }])
              }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedDoc?.doc_id === doc.doc_id
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-violet-500 flex-shrink-0" />
                <p className="text-xs font-medium text-gray-900 truncate">{doc.filename}</p>
              </div>
              <p className="text-xs text-gray-400 mt-1">{doc.chunk_count} chunks</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {!selectedDoc ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <Bot className="mx-auto mb-3 text-gray-300" size={40} />
              <p className="text-gray-400 text-sm">Select a document from the left to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <FileText size={16} className="text-violet-500" />
              <span className="text-sm font-medium text-gray-700">{selectedDoc.filename}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Bot size={16} className="text-gray-600" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-gray-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about the document..."
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="bg-violet-600 text-white p-2.5 rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}