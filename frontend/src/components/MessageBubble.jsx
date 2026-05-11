import { Bot, User } from 'lucide-react'

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-violet-100' : 'bg-gray-100'}`}>
        {isUser
          ? <User size={16} className="text-violet-600" />
          : <Bot size={16} className="text-gray-600" />
        }
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
        ? 'bg-violet-600 text-white rounded-tr-sm'
        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
      }`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Sources used:</p>
            {message.sources.map((s, i) => (
              <p key={i} className="text-xs text-gray-400 truncate">
                [{i+1}] {s.content}... <span className="text-gray-300">({Math.round(s.score * 100)}% match)</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}