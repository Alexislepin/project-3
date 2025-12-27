import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  loadConversations,
  createConversation,
  loadMessages,
  addMessage,
  type AIConversation,
  type AIMessage,
} from '../lib/aiConversations';
import { supabase } from '../lib/supabase';
import { BookCover } from './BookCover';

interface AvailableBook {
  bookId: string;
  bookKey: string;
  title: string;
  author: string;
  cover_url: string | null;
  total_pages: number | null;
  current_page: number;
}

interface LibraryAIModalProps {
  onClose: () => void;
  bookKey?: string;
  bookTitle?: string;
  bookAuthor?: string;
  currentPage?: number;
  totalPages?: number;
  availableBooks?: AvailableBook[];
}

export function LibraryAIModal({
  onClose,
  bookKey,
  bookTitle,
  bookAuthor,
  currentPage,
  totalPages,
  availableBooks = [],
}: LibraryAIModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedBook, setSelectedBook] = useState<AvailableBook | null>(
    bookKey && bookTitle ? {
      bookId: '',
      bookKey,
      title: bookTitle,
      author: bookAuthor || '',
      cover_url: null,
      total_pages: totalPages || null,
      current_page: currentPage || 0,
    } : null
  );
  const [showBookPicker, setShowBookPicker] = useState(!bookKey);
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Load conversations when selectedBook changes
  useEffect(() => {
    if (selectedBook?.bookKey && user?.id) {
      loadConversationsList();
    }
  }, [selectedBook?.bookKey, user?.id]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      loadMessagesList(selectedConversation.id);
      setActiveTab('new'); // Switch to new tab to show messages
    }
  }, [selectedConversation]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversationsList = async () => {
    if (!selectedBook?.bookKey || !user?.id) return;

    setLoading(true);
    try {
      const data = await loadConversations(user.id, selectedBook.bookKey);
      setConversations(data);
    } catch (error) {
      console.error('[LibraryAIModal] Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessagesList = async (conversationId: string) => {
    try {
      const data = await loadMessages(conversationId);
      setMessages(data);
    } catch (error) {
      console.error('[LibraryAIModal] Error loading messages:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStartNewConversation = async () => {
    if (!selectedBook?.bookKey || !user?.id) return;

    setLoading(true);
    try {
      const title = selectedBook.title ? `IA — ${selectedBook.title}` : null;
      const newConv = await createConversation(user.id, selectedBook.bookKey, title || undefined);
      if (newConv) {
        setSelectedConversation(newConv);
        setMessages([]);
        await loadConversationsList();
      }
    } catch (error) {
      console.error('[LibraryAIModal] Error creating conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBook = (book: AvailableBook) => {
    setSelectedBook(book);
    setShowBookPicker(false);
    setSelectedConversation(null);
    setMessages([]);
  };

  const filteredBooks = availableBooks.filter(book => {
    if (!bookSearchQuery.trim()) return true;
    const query = bookSearchQuery.toLowerCase();
    return book.title.toLowerCase().includes(query) || book.author.toLowerCase().includes(query);
  });

  const handleSelectConversation = async (conv: AIConversation) => {
    setSelectedConversation(conv);
    await loadMessagesList(conv.id);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !user?.id || sending) return;

    // If no conversation selected, create one
    let conv = selectedConversation;
    if (!conv && selectedBook?.bookKey) {
      const title = selectedBook.title ? `IA — ${selectedBook.title}` : null;
      conv = await createConversation(user.id, selectedBook.bookKey, title || undefined);
      if (!conv) {
        console.error('[LibraryAIModal] Failed to create conversation');
        return;
      }
      setSelectedConversation(conv);
      await loadConversationsList();
    }

    if (!conv || !selectedBook) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    try {
      // Add user message
      const userMsg = await addMessage(
        conv.id,
        user.id,
        'user',
        userMessage,
        {
          current_page: selectedBook.current_page,
          total_pages: selectedBook.total_pages,
        }
      );

      if (userMsg) {
        setMessages((prev) => [...prev, userMsg]);
      }

      // Call AI endpoint
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('ai_chat', {
        body: {
          conversation_id: conv.id,
          book_key: selectedBook.bookKey,
          book_context: {
            title: selectedBook.title,
            author: selectedBook.author,
            current_page: selectedBook.current_page,
            total_pages: selectedBook.total_pages,
          },
          user_message: userMessage,
        },
      });

      if (aiError) {
        console.error('[LibraryAIModal] AI error:', aiError);
        const errorMsg = await addMessage(
          conv.id,
          user.id,
          'assistant',
          'Désolé, une erreur est survenue. Veuillez réessayer.',
          null
        );
        if (errorMsg) {
          setMessages((prev) => [...prev, errorMsg]);
        }
        return;
      }

      // Add assistant message
      if (aiResponse?.assistant_message) {
        const assistantMsg = await addMessage(
          conv.id,
          user.id,
          'assistant',
          aiResponse.assistant_message,
          null
        );
        if (assistantMsg) {
          setMessages((prev) => [...prev, assistantMsg]);
        }
      }
    } catch (error) {
      console.error('[LibraryAIModal] Error sending message:', error);
      const errorMsg = await addMessage(
        conv.id!,
        user.id,
        'assistant',
        'Désolé, une erreur est survenue. Veuillez réessayer.',
        null
      );
      if (errorMsg) {
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setSending(false);
    }
  };

  const handleQuickAction = (action: string) => {
    const quickActions: { [key: string]: string } = {
      summary: 'Résumé des pages lues',
      takeaways: 'Points clés',
      quiz: 'Quiz rapide',
      explain: 'Explique-moi comme si j\'avais 10 ans',
    };

    const message = quickActions[action] || action;
    setInputMessage(message);
  };

  const currentConv = selectedConversation || (conversations.length > 0 ? conversations[0] : null);

  useScrollLock(true);

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[200]" 
      data-modal-overlay
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevent scroll on overlay
        const target = e.target as HTMLElement;
        if (!target.closest('[data-modal-content]')) {
          e.preventDefault();
        }
      }}
    >
      <div
        data-modal-content
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: `calc(16px + env(safe-area-inset-bottom))` }}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold">IA</h2>
              {selectedBook ? (
                <p className="text-sm text-stone-600 truncate">{selectedBook.title}</p>
              ) : (
                <p className="text-sm text-stone-600">Choisissez un livre</p>
              )}
            </div>
            {selectedBook && (
              <button
                onClick={() => {
                  setShowBookPicker(true);
                  setSelectedBook(null);
                  setSelectedConversation(null);
                  setMessages([]);
                }}
                className="text-xs text-stone-600 hover:text-stone-900 px-2 py-1 rounded hover:bg-stone-100 transition-colors flex-shrink-0"
              >
                Changer
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b border-stone-200 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => {
                setActiveTab('new');
                if (!selectedConversation) {
                  handleStartNewConversation();
                }
              }}
              className={`py-3 px-2 border-b-2 transition-colors ${
                activeTab === 'new'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-stone-600 hover:text-stone-900'
              }`}
            >
              Nouveau
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-3 px-2 border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-stone-600 hover:text-stone-900'
              }`}
            >
              Historique
            </button>
          </div>
        </div>

        {/* Book Picker */}
        {showBookPicker && (
          <div className="flex-1 overflow-y-auto p-4 border-b border-stone-200">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  placeholder="Rechercher un livre..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
            {availableBooks.length === 0 ? (
              <div className="text-center py-12 text-stone-500">
                <p>Aucun livre disponible</p>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="text-center py-12 text-stone-500">
                <p>Aucun résultat pour "{bookSearchQuery}"</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredBooks.slice(0, 10).map((book) => (
                  <button
                    key={book.bookKey}
                    onClick={() => handleSelectBook(book)}
                    className="w-full flex gap-3 p-3 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors text-left"
                  >
                    <BookCover
                      coverUrl={book.cover_url}
                      title={book.title}
                      author={book.author}
                      className="w-12 h-16 shrink-0 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{book.title}</p>
                      <p className="text-sm text-stone-600 truncate">{book.author}</p>
                      {book.total_pages && book.current_page > 0 && (
                        <p className="text-xs text-stone-500 mt-1">
                          p. {book.current_page} / {book.total_pages}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedBook && !showBookPicker ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-stone-600 mb-4">Choisissez un livre pour commencer</p>
                <button
                  onClick={() => setShowBookPicker(true)}
                  className="px-6 py-3 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-colors"
                >
                  Choisir un livre
                </button>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            /* History Tab */
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-12 text-stone-500">Chargement...</div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-stone-600 mb-2">Aucune conversation</p>
                  <p className="text-sm text-stone-500">Commencez une nouvelle conversation</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors ${
                        selectedConversation?.id === conv.id
                          ? 'bg-primary/10 border-primary'
                          : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <p className="font-semibold text-stone-900">
                        {conv.title || 'Conversation sans titre'}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        {new Date(conv.updated_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Chat Tab */
            <>
              {!currentConv ? (
                <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
                  <div className="w-full max-w-sm px-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          handleQuickAction('summary');
                          handleStartNewConversation();
                        }}
                        className="px-4 py-3 bg-stone-100 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors text-left"
                      >
                        Résumé des pages lues
                      </button>
                      <button
                        onClick={() => {
                          handleQuickAction('takeaways');
                          handleStartNewConversation();
                        }}
                        className="px-4 py-3 bg-stone-100 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors text-left"
                      >
                        Points clés
                      </button>
                      <button
                        onClick={() => {
                          handleQuickAction('quiz');
                          handleStartNewConversation();
                        }}
                        className="px-4 py-3 bg-stone-100 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors text-left"
                      >
                        Quiz rapide
                      </button>
                      <button
                        onClick={() => {
                          handleQuickAction('explain');
                          handleStartNewConversation();
                        }}
                        className="px-4 py-3 bg-stone-100 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors text-left"
                      >
                        Explique-moi comme si j'avais 10 ans
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Messages */}
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4"
                    style={{ paddingBottom: `calc(16px + env(safe-area-inset-bottom))` }}
                  >
                    {messages.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-stone-600 mb-4">Commencez la conversation</p>
                        <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                          <button
                            onClick={() => handleQuickAction('summary')}
                            className="px-3 py-2 bg-stone-100 rounded-lg text-xs font-medium hover:bg-stone-200 transition-colors"
                          >
                            Résumé des pages lues
                          </button>
                          <button
                            onClick={() => handleQuickAction('takeaways')}
                            className="px-3 py-2 bg-stone-100 rounded-lg text-xs font-medium hover:bg-stone-200 transition-colors"
                          >
                            Points clés
                          </button>
                          <button
                            onClick={() => handleQuickAction('quiz')}
                            className="px-3 py-2 bg-stone-100 rounded-lg text-xs font-medium hover:bg-stone-200 transition-colors"
                          >
                            Quiz rapide
                          </button>
                          <button
                            onClick={() => handleQuickAction('explain')}
                            className="px-3 py-2 bg-stone-100 rounded-lg text-xs font-medium hover:bg-stone-200 transition-colors"
                          >
                            Explique-moi comme si j'avais 10 ans
                          </button>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                              msg.role === 'user'
                                ? 'bg-primary text-black'
                                : 'bg-stone-100 text-stone-900'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                    {sending && (
                      <div className="flex justify-start">
                        <div className="bg-stone-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-stone-600">Réflexion...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="flex-shrink-0 border-t border-stone-200 p-4 bg-white" style={{ paddingBottom: `calc(16px + env(safe-area-inset-bottom))` }}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Posez une question..."
                        className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        disabled={sending || !selectedBook}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputMessage.trim() || sending || !selectedBook}
                        className="w-12 h-12 rounded-xl bg-primary text-black flex items-center justify-center hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

