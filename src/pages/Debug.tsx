import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { debugLog, fatalError } from '../utils/logger';

interface SessionData {
  session: any;
  error: string | null;
}

interface BooksData {
  books: any[] | null;
  error: string | null;
}

export function Debug() {
  const { user } = useAuth();
  const [sessionData, setSessionData] = useState<SessionData>({ session: null, error: null });
  const [booksData, setBooksData] = useState<BooksData>({ books: null, error: null });
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(true);

  // Hook: Load session
  useEffect(() => {
    const loadSession = async () => {
      setLoadingSession(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          fatalError('[Debug] getSession error:', error);
          setSessionData({ session: null, error: error.message });
        } else {
          debugLog('[Debug] getSession success:', data);
          setSessionData({ session: data.session, error: null });
        }
      } catch (err: any) {
        fatalError('[Debug] getSession exception:', err);
        setSessionData({ session: null, error: err.message || 'Unknown error' });
      } finally {
        setLoadingSession(false);
      }
    };

    loadSession();
  }, []);

  // Hook: Test DB query (books)
  useEffect(() => {
    const testBooksQuery = async () => {
      setLoadingBooks(true);
      try {
        const { data, error } = await supabase
          .from('books')
          .select('*')
          .limit(5);
        
        if (error) {
          fatalError('[Debug] books query error:', error);
          setBooksData({ books: null, error: error.message });
        } else {
          debugLog('[Debug] books query success:', data);
          setBooksData({ books: data, error: null });
        }
      } catch (err: any) {
        fatalError('[Debug] books query exception:', err);
        setBooksData({ books: null, error: err.message || 'Unknown error' });
      } finally {
        setLoadingBooks(false);
      }
    };

    testBooksQuery();
  }, []);

  return (
    <div className="min-h-screen bg-background-light p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-text-main-light">🔍 Debug Page</h1>

        <div className="space-y-6">
          {/* User Info */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-text-main-light">👤 User Info</h2>
            {user ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">✅</span>
                  <span className="text-text-main-light"><strong>ID:</strong> {user.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">✅</span>
                  <span className="text-text-main-light"><strong>Email:</strong> {user.email || 'N/A'}</span>
                </div>
                {user.created_at && (
                  <div className="text-text-sub-light text-xs mt-2">
                    Created: {new Date(user.created_at).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-semibold">❌</span>
                <span className="text-text-sub-light">Not logged in</span>
              </div>
            )}
          </div>

          {/* Session Data */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-text-main-light">🔐 Session (supabase.auth.getSession())</h2>
            {loadingSession ? (
              <div className="text-text-sub-light">Loading...</div>
            ) : sessionData.error ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-semibold">❌</span>
                  <span className="text-red-600 font-semibold">Error:</span>
                </div>
                <div className="text-red-600 text-sm font-mono bg-red-50 p-3 rounded border border-red-200">
                  {sessionData.error}
                </div>
              </div>
            ) : sessionData.session ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">✅</span>
                  <span className="text-green-600 font-semibold">Session active</span>
                </div>
                <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-auto max-h-48 text-text-main-light">
                  {JSON.stringify(sessionData.session, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-yellow-600 font-semibold">⚠️</span>
                <span className="text-text-sub-light">No session found</span>
              </div>
            )}
          </div>

          {/* DB Test: Books */}
          <div className="bg-card-light rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-4 text-text-main-light">📚 DB Test: SELECT * FROM books LIMIT 5</h2>
            {loadingBooks ? (
              <div className="text-text-sub-light">Loading...</div>
            ) : booksData.error ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-semibold">❌</span>
                  <span className="text-red-600 font-semibold">Query failed</span>
                </div>
                <div className="text-red-600 text-sm font-mono bg-red-50 p-3 rounded border border-red-200">
                  {booksData.error}
                </div>
              </div>
            ) : booksData.books ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-semibold">✅</span>
                  <span className="text-green-600 font-semibold">
                    Success: {booksData.books.length} book(s) found
                  </span>
                </div>
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-200">
                        {booksData.books.length > 0 && Object.keys(booksData.books[0]).map((key) => (
                          <th key={key} className="p-2 text-left font-semibold text-text-main-light border-r border-gray-200">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {booksData.books.map((book, idx) => (
                        <tr key={idx} className="border-b border-gray-200">
                          {Object.entries(book).map(([key, value]) => (
                            <td key={key} className="p-2 text-text-sub-light border-r border-gray-200">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-yellow-600 font-semibold">⚠️</span>
                <span className="text-text-sub-light">No data returned</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

