import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { Socket } from "socket.io-client";

interface ChatMessage {
  id: string;
  senderName: string;
  message: string;
  createdAt: number;
}

interface TextChatProps {
  socket: Socket | null;
  senderName: string;
}

export default function TextChat({ socket, senderName }: TextChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("chat:message", handleMessage);

    return () => {
      socket.off("chat:message", handleMessage);
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    if (!input.trim() || !socket) return;
    socket.emit("chat:message", { message: input.trim() });
    setInput("");
  }

  return (
    <div className="card h-full flex flex-col">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-primary-400" /> Text Chat
      </h3>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[200px] max-h-[400px]">
        {messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center mt-8">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.senderName === senderName
                  ? "bg-primary-600/20 ml-8"
                  : "bg-slate-700/50 mr-8"
              }`}
            >
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-medium text-xs text-primary-300">{msg.senderName}</span>
                <span className="text-[10px] text-slate-500">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-slate-200 break-words">{msg.message}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage} disabled={!input.trim()} className="btn-primary p-2 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
