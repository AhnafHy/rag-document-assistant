import { FileText, Trash2, MessageSquare } from 'lucide-react'

export default function DocumentCard({ doc, onSelect, onDelete, selected }) {
  return (
    <div className={`bg-white rounded-xl border p-4 transition-all cursor-pointer ${
      selected ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText size={18} className="text-violet-500 flex-shrink-0" />
          <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(doc.doc_id) }}
          className="text-gray-300 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">{doc.chunk_count} chunks · {new Date(doc.processed_at).toLocaleDateString()}</p>
      <button
        onClick={() => onSelect(doc)}
        className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${
          selected
            ? 'bg-violet-600 text-white'
            : 'bg-gray-50 text-gray-600 hover:bg-violet-50 hover:text-violet-600'
        }`}
      >
        <MessageSquare size={12} />
        {selected ? 'Chatting with this doc' : 'Chat with this doc'}
      </button>
    </div>
  )
}