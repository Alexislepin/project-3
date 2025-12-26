interface ManageBookProps {
  bookId: string;
}

export function ManageBook({ bookId }: ManageBookProps) {
  return (
    <div className="min-h-screen bg-background-light flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-6 max-w-md w-full text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-main">Manage Book</h1>
        <p className="text-sm text-text-sub-light">
          ID du livre : <span className="font-mono">{bookId}</span>
        </p>
      </div>
    </div>
  );
}

export default ManageBook;


