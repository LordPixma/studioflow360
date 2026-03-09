import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';

const API = '/api/documents';

const CATEGORY_LABELS: Record<string, string> = {
  contract: 'Contract', invoice: 'Invoice', receipt: 'Receipt', photo: 'Photo',
  certificate: 'Certificate', insurance: 'Insurance', floor_plan: 'Floor Plan',
  rider: 'Rider', release_form: 'Release Form', other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-700', invoice: 'bg-green-100 text-green-700',
  receipt: 'bg-yellow-100 text-yellow-700', photo: 'bg-pink-100 text-pink-700',
  certificate: 'bg-purple-100 text-purple-700', insurance: 'bg-red-100 text-red-700',
  floor_plan: 'bg-cyan-100 text-cyan-700', rider: 'bg-orange-100 text-orange-700',
  release_form: 'bg-indigo-100 text-indigo-700', other: 'bg-gray-100 text-gray-700',
};

const FILE_ICONS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/gif': 'GIF', 'image/webp': 'WEBP',
  'application/msword': 'DOC', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/plain': 'TXT', 'text/csv': 'CSV',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Document {
  id: string; filename: string; original_filename: string; mime_type: string;
  file_size: number; r2_key: string; category: string; description: string | null;
  booking_id: string | null; guest_id: string | null; contract_id: string | null;
  task_id: string | null; asset_id: string | null; room_id: string | null;
  tags: string; uploaded_by: string; uploaded_by_name: string;
  created_at: string; updated_at: string;
}

interface Summary {
  total_documents: number; total_size: number; category_count: number;
  by_category: Array<{ category: string; count: number }>;
}

export function DocumentsPage() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const canManage = staff?.permissions?.includes('documents.manage');

  const fetchDocs = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCategory) params.set('category', filterCategory);
    if (search) params.set('search', search);
    params.set('per_page', '100');

    const res = await fetch(`${API}?${params}`);
    const json = await res.json() as { success: boolean; data: Document[] };
    if (json.success) setDocuments(json.data);
  }, [filterCategory, search]);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`${API}/summary`);
    const json = await res.json() as { success: boolean; data: Summary };
    if (json.success) setSummary(json.data);
  }, []);

  useEffect(() => {
    Promise.all([fetchDocs(), fetchSummary()]).finally(() => setLoading(false));
  }, [fetchDocs, fetchSummary]);

  const downloadDoc = (doc: Document) => {
    window.open(`${API}/${doc.id}/download`, '_blank');
  };

  const deleteDoc = async (id: string) => {
    if (!confirm('Delete this document permanently?')) return;
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Document deleted', 'success');
      setSelectedDoc(null);
      fetchDocs(); fetchSummary();
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">Upload, organize, and manage studio files</p>
        </div>
        {canManage && (
          <button onClick={() => setShowUpload(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            + Upload File
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Documents</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.total_documents}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Size</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatFileSize(summary.total_size ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Categories Used</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.category_count}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Top Category</p>
            <p className="mt-1 text-lg font-bold text-gray-900">{summary.by_category?.[0] ? CATEGORY_LABELS[summary.by_category[0].category] : '—'}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text" placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Document Grid */}
      {documents.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="mt-3 text-gray-500">No documents found</p>
          {canManage && <p className="mt-1 text-sm text-gray-400">Upload your first document to get started</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {documents.map(doc => (
            <div
              key={doc.id}
              onClick={() => setSelectedDoc(doc)}
              className="group cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">
                  {FILE_ICONS[doc.mime_type] || doc.original_filename.split('.').pop()?.toUpperCase()?.slice(0, 4) || 'FILE'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-600">{doc.original_filename}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ${CATEGORY_COLORS[doc.category]}`}>{CATEGORY_LABELS[doc.category]}</span>
                    <span className="text-[10px] text-gray-400">{formatFileSize(doc.file_size)}</span>
                  </div>
                  {doc.description && <p className="mt-1 truncate text-xs text-gray-500">{doc.description}</p>}
                  <p className="mt-1.5 text-[10px] text-gray-400">{doc.uploaded_by_name} &middot; {new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={() => { setShowUpload(false); fetchDocs(); fetchSummary(); toast('Document uploaded', 'success'); }} />}

      {/* Document Detail Slide-over */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedDoc(null)}>
          <div className="w-full max-w-md overflow-auto bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 truncate pr-4">{selectedDoc.original_filename}</h2>
                <button onClick={() => setSelectedDoc(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORY_COLORS[selectedDoc.category]}`}>{CATEGORY_LABELS[selectedDoc.category]}</span>
                <span className="text-xs text-gray-500">{formatFileSize(selectedDoc.file_size)}</span>
                <span className="text-xs text-gray-400">{selectedDoc.mime_type}</span>
              </div>
            </div>

            <div className="space-y-5 px-6 py-4">
              {/* Preview for images */}
              {selectedDoc.mime_type.startsWith('image/') && (
                <img src={`${API}/${selectedDoc.id}/download`} alt={selectedDoc.original_filename} className="w-full rounded-lg border border-gray-100" />
              )}

              {selectedDoc.description && (
                <div><p className="text-xs font-medium text-gray-500 mb-1">Description</p><p className="text-sm text-gray-700">{selectedDoc.description}</p></div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-gray-500">Uploaded by</p><p className="font-medium">{selectedDoc.uploaded_by_name}</p></div>
                <div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{new Date(selectedDoc.created_at).toLocaleString()}</p></div>
              </div>

              {/* Tags */}
              {(() => {
                const tags = JSON.parse(selectedDoc.tags || '[]') as string[];
                return tags.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map(tag => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag}</span>)}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => downloadDoc(selectedDoc)} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Download
                </button>
                {canManage && (
                  <button onClick={() => deleteDoc(selectedDoc.id)} className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.size > 25 * 1024 * 1024) { alert('File must be under 25MB'); return; }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify({ category, description: description || undefined }));

    const res = await fetch(API, { method: 'POST', body: formData });
    setUploading(false);
    if (res.ok) onUploaded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Upload Document</h2>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
        >
          <input ref={fileRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              <p className="mt-2 text-xs text-blue-600">Click or drag to replace</p>
            </div>
          ) : (
            <div>
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="mt-2 text-sm text-gray-600">Drag and drop or click to browse</p>
              <p className="text-xs text-gray-400">Max 25MB</p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={handleUpload} disabled={!file || uploading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
