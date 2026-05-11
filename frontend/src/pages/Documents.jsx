import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FileText, Upload, Trash2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function Documents() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => axios.get(`${API}/documents`).then(r => r.data)
  })

  const deleteDoc = async (docId) => {
    await axios.delete(`${API}/documents/${docId}`)
    queryClient.invalidateQueries(['documents'])
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
    </div>
  )

  const docs = data || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
          <p className="text-gray-500 text-sm mt-1">{docs.length} documents uploaded</p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="flex items-center gap-1.5 bg-violet-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Upload size={15} /> Upload new
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <FileText className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-400 mb-4">No documents uploaded yet</p>
          <button
            onClick={() => navigate('/upload')}
            className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            Upload your first document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map(doc => (
            <div key={doc.doc_id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText size={20} className="text-violet-500 flex-shrink-0" />
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                </div>
                <button
                  onClick={() => deleteDoc(doc.doc_id)}
                  className="text-gray-300 hover:text-red-400 transition-colors ml-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="space-y-1 mb-4">
                <p className="text-xs text-gray-400">{doc.chunk_count} text chunks indexed</p>
                <p className="text-xs text-gray-400">Uploaded {new Date(doc.processed_at).toLocaleDateString()}</p>
                <span className="inline-flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  ● {doc.status}
                </span>
              </div>
              <button
                onClick={() => navigate(`/?doc=${encodeURIComponent(doc.filename)}`)}
                className="w-full text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 py-2 rounded-lg transition-colors"
              >
                Chat with this document →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}