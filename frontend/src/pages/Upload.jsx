import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

export default function UploadPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('idle') // idle, uploading, processing, success, error
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')

  const uploadFile = async (file) => {
    setFilename(file.name)
    setStatus('uploading')
    setError('')

    try {
      // Get presigned URL
      const urlRes = await axios.post(`${API}/documents/upload-url`, {
        filename: file.name
      })

      const { upload_url } = urlRes.data

      // Upload directly to S3
      await axios.put(upload_url, file, {
        headers: { 'Content-Type': 'application/pdf' }
      })

      setStatus('processing')

      // Wait for processing
      setTimeout(() => {
        setStatus('success')
      }, 3000)

    } catch (err) {
      setStatus('error')
      setError('Upload failed. Please try again.')
    }
  }

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      uploadFile(acceptedFiles[0])
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: status === 'uploading' || status === 'processing'
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Upload Document</h1>
        <p className="text-gray-500 text-sm mt-1">Upload a PDF — it will be automatically chunked, embedded, and indexed for Q&A</p>
      </div>

      {status === 'idle' || status === 'error' ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-violet-400 bg-violet-50' : 'border-gray-300 hover:border-violet-300 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto mb-4 text-gray-400" size={40} />
          <p className="text-gray-700 font-medium mb-1">
            {isDragActive ? 'Drop your PDF here' : 'Drag and drop a PDF'}
          </p>
          <p className="text-gray-400 text-sm mb-4">or click to browse</p>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">PDF only</span>

          {status === 'error' && (
            <div className="mt-4 flex items-center gap-2 text-red-500 justify-center">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FileText size={24} className="text-violet-500" />
            <span className="text-sm font-medium text-gray-700">{filename}</span>
          </div>

          {status === 'uploading' && (
            <div>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">Uploading to S3...</p>
            </div>
          )}

          {status === 'processing' && (
            <div>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">Processing document — chunking and generating embeddings...</p>
              <p className="text-xs text-gray-400 mt-1">This takes about 15–30 seconds</p>
            </div>
          )}

          {status === 'success' && (
            <div>
              <CheckCircle className="mx-auto mb-3 text-green-500" size={40} />
              <p className="text-gray-700 font-medium mb-1">Document ready</p>
              <p className="text-gray-400 text-sm mb-6">Your document has been indexed and is ready for Q&A</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => navigate('/')}
                  className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
                >
                  Start chatting →
                </button>
                <button
                  onClick={() => setStatus('idle')}
                  className="border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Upload another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 bg-blue-50 rounded-xl p-4">
        <p className="text-sm text-blue-700 font-medium mb-1">How it works</p>
        <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
          <li>PDF is uploaded directly to S3 via a presigned URL</li>
          <li>S3 event triggers a Lambda function automatically</li>
          <li>Lambda extracts text, splits into 500-word chunks</li>
          <li>Each chunk is embedded using OpenAI text-embedding-3-small</li>
          <li>Embeddings and chunks are stored in DynamoDB</li>
          <li>At query time, your question is embedded and compared against all chunks using cosine similarity</li>
          <li>Top matching chunks are sent to GPT-4o-mini as context for the answer</li>
        </ol>
      </div>
    </div>
  )
}