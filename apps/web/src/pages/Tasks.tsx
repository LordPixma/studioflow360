import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';

const API = '/api/tasks';

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General', maintenance: 'Maintenance', cleaning: 'Cleaning', repair: 'Repair',
  setup: 'Setup', teardown: 'Teardown', admin: 'Admin', follow_up: 'Follow-up',
};

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-100 text-gray-700', maintenance: 'bg-yellow-100 text-yellow-700',
  cleaning: 'bg-cyan-100 text-cyan-700', repair: 'bg-red-100 text-red-700',
  setup: 'bg-green-100 text-green-700', teardown: 'bg-orange-100 text-orange-700',
  admin: 'bg-purple-100 text-purple-700', follow_up: 'bg-blue-100 text-blue-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', on_hold: 'On Hold',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-gray-100 text-gray-500', on_hold: 'bg-purple-100 text-purple-700',
};

interface Task {
  id: string; task_number: string; title: string; description: string | null;
  category: string; status: string; priority: string;
  due_date: string | null; due_time: string | null;
  room_id: string | null; room_name: string | null;
  assigned_to: string | null; assigned_name: string | null;
  booking_id: string | null; asset_id: string | null;
  is_recurring: number; recurrence_rule: string | null;
  completed_at: string | null; completed_by_name: string | null;
  created_at: string; updated_at: string;
  comments?: Array<{ id: string; content: string; author_name: string; created_at: string }>;
  checklist?: Array<{ id: string; label: string; is_checked: number; sort_order: number }>;
}

interface Summary {
  total: number; open_count: number; in_progress_count: number;
  completed_count: number; on_hold_count: number; urgent_count: number; overdue_count: number;
}

interface StaffMember { id: string; display_name: string }
interface Room { id: string; name: string }

export function TasksPage() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newComment, setNewComment] = useState('');

  const canManage = staff?.permissions?.includes('tasks.manage');

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterCategory) params.set('category', filterCategory);
    if (filterPriority) params.set('priority', filterPriority);
    if (search) params.set('search', search);
    params.set('per_page', '100');

    const res = await fetch(`${API}?${params}`);
    const json = await res.json() as { success: boolean; data: Task[] };
    if (json.success) setTasks(json.data);
  }, [filterStatus, filterCategory, filterPriority, search]);

  const fetchSummary = useCallback(async () => {
    const res = await fetch(`${API}/summary`);
    const json = await res.json() as { success: boolean; data: Summary };
    if (json.success) setSummary(json.data);
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchSummary()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchSummary]);

  useEffect(() => {
    Promise.all([
      fetch('/api/staff/list').then(r => r.json()).then((j: { data: StaffMember[] }) => setStaffList(j.data || [])),
      fetch('/api/rooms').then(r => r.json()).then((j: { data: Room[] }) => setRooms(j.data || [])),
    ]);
  }, []);

  const openDetail = async (task: Task) => {
    const res = await fetch(`${API}/${task.id}`);
    const json = await res.json() as { success: boolean; data: Task };
    if (json.success) setSelectedTask(json.data);
  };

  const updateStatus = async (taskId: string, status: string) => {
    const res = await fetch(`${API}/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast(`Task ${status === 'completed' ? 'completed' : 'updated'}`, 'success');
      fetchTasks(); fetchSummary();
      if (selectedTask?.id === taskId) openDetail(selectedTask);
    }
  };

  const toggleChecklist = async (taskId: string, itemId: string, current: number) => {
    await fetch(`${API}/${taskId}/checklist/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_checked: current ? 0 : 1 }),
    });
    if (selectedTask) openDetail(selectedTask);
  };

  const addComment = async () => {
    if (!selectedTask || !newComment.trim()) return;
    const res = await fetch(`${API}/${selectedTask.id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment }),
    });
    if (res.ok) {
      setNewComment('');
      openDetail(selectedTask);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    const res = await fetch(`${API}/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Task deleted', 'success');
      setSelectedTask(null);
      fetchTasks(); fetchSummary();
    }
  };

  const isOverdue = (t: Task) => !!(t.due_date && t.due_date < new Date().toISOString().split('T')[0]! && !['completed', 'cancelled'].includes(t.status));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks & Maintenance</h1>
          <p className="text-sm text-gray-500">Manage studio tasks, maintenance, and operations</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
            + New Task
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: 'Total', value: summary.total, color: 'text-gray-900' },
            { label: 'Open', value: summary.open_count, color: 'text-blue-600' },
            { label: 'In Progress', value: summary.in_progress_count, color: 'text-yellow-600' },
            { label: 'Completed', value: summary.completed_count, color: 'text-green-600' },
            { label: 'On Hold', value: summary.on_hold_count, color: 'text-purple-600' },
            { label: 'Urgent', value: summary.urgent_count, color: 'text-red-600' },
            { label: 'Overdue', value: summary.overdue_count, color: 'text-red-700' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">No tasks found</p>
          </div>
        ) : tasks.map(task => (
          <div
            key={task.id}
            onClick={() => openDetail(task)}
            className={`flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 ${isOverdue(task) ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}
          >
            {/* Quick complete checkbox */}
            {canManage && task.status !== 'completed' && task.status !== 'cancelled' && (
              <button
                onClick={e => { e.stopPropagation(); updateStatus(task.id, 'completed'); }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 text-gray-300 transition-colors hover:border-green-500 hover:text-green-500"
                title="Mark complete"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </button>
            )}
            {task.status === 'completed' && (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">{task.task_number}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[task.category]}`}>{CATEGORY_LABELS[task.category]}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                {isOverdue(task) && <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Overdue</span>}
                {task.is_recurring ? <span className="text-[10px] text-gray-400">&#x1f501;</span> : null}
              </div>
              <p className={`mt-1 text-sm font-medium ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                {task.assigned_name && <span>Assigned: {task.assigned_name}</span>}
                {task.room_name && <span>Room: {task.room_name}</span>}
                {task.due_date && <span>Due: {task.due_date}{task.due_time ? ` ${task.due_time}` : ''}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Task Modal */}
      {showForm && <CreateTaskModal staffList={staffList} rooms={rooms} onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); fetchTasks(); fetchSummary(); toast('Task created', 'success'); }} />}

      {/* Task Detail Slide-over */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedTask(null)}>
          <div className="w-full max-w-lg overflow-auto bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-gray-400">{selectedTask.task_number}</p>
                  <h2 className="text-lg font-bold text-gray-900">{selectedTask.title}</h2>
                </div>
                <button onClick={() => setSelectedTask(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[selectedTask.status]}`}>{STATUS_LABELS[selectedTask.status]}</span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_COLORS[selectedTask.priority]}`}>{selectedTask.priority}</span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORY_COLORS[selectedTask.category]}`}>{CATEGORY_LABELS[selectedTask.category]}</span>
              </div>
            </div>

            <div className="space-y-6 px-6 py-4">
              {/* Description */}
              {selectedTask.description && (
                <div><p className="text-xs font-medium text-gray-500 mb-1">Description</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTask.description}</p></div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedTask.assigned_name && <div><p className="text-xs text-gray-500">Assigned to</p><p className="font-medium">{selectedTask.assigned_name}</p></div>}
                {selectedTask.room_name && <div><p className="text-xs text-gray-500">Room</p><p className="font-medium">{selectedTask.room_name}</p></div>}
                {selectedTask.due_date && <div><p className="text-xs text-gray-500">Due Date</p><p className="font-medium">{selectedTask.due_date}{selectedTask.due_time ? ` at ${selectedTask.due_time}` : ''}</p></div>}
                {selectedTask.completed_at && <div><p className="text-xs text-gray-500">Completed</p><p className="font-medium">{new Date(selectedTask.completed_at).toLocaleDateString()}{selectedTask.completed_by_name ? ` by ${selectedTask.completed_by_name}` : ''}</p></div>}
                {selectedTask.is_recurring ? <div><p className="text-xs text-gray-500">Recurrence</p><p className="font-medium capitalize">{selectedTask.recurrence_rule}</p></div> : null}
              </div>

              {/* Status actions */}
              {canManage && !['completed', 'cancelled'].includes(selectedTask.status) && (
                <div className="flex flex-wrap gap-2">
                  {selectedTask.status === 'open' && <button onClick={() => updateStatus(selectedTask.id, 'in_progress')} className="rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-200">Start</button>}
                  {selectedTask.status === 'in_progress' && <button onClick={() => updateStatus(selectedTask.id, 'on_hold')} className="rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200">Hold</button>}
                  {selectedTask.status === 'on_hold' && <button onClick={() => updateStatus(selectedTask.id, 'in_progress')} className="rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-200">Resume</button>}
                  <button onClick={() => updateStatus(selectedTask.id, 'completed')} className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200">Complete</button>
                  <button onClick={() => updateStatus(selectedTask.id, 'cancelled')} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">Cancel</button>
                </div>
              )}

              {/* Checklist */}
              {selectedTask.checklist && selectedTask.checklist.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Checklist ({selectedTask.checklist.filter(i => i.is_checked).length}/{selectedTask.checklist.length})</p>
                  <div className="space-y-1">
                    {selectedTask.checklist.map(item => (
                      <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <input
                          type="checkbox" checked={!!item.is_checked}
                          onChange={() => toggleChecklist(selectedTask.id, item.id, item.is_checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className={`text-sm ${item.is_checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Comments</p>
                {selectedTask.comments && selectedTask.comments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedTask.comments.map(comment => (
                      <div key={comment.id} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700">{comment.author_name}</span>
                          <span className="text-[10px] text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-400">No comments yet</p>}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text" value={newComment} onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addComment()}
                    placeholder="Add a comment..." className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button onClick={addComment} disabled={!newComment.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Post</button>
                </div>
              </div>

              {/* Delete */}
              {canManage && (
                <button onClick={() => deleteTask(selectedTask.id)} className="text-xs text-red-500 hover:text-red-700">Delete task</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTaskModal({ staffList, rooms, onClose, onCreated }: {
  staffList: Array<{ id: string; display_name: string }>;
  rooms: Array<{ id: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '', description: '', category: 'general', priority: 'medium',
    due_date: '', due_time: '', room_id: '', assigned_to: '',
    is_recurring: 0, recurrence_rule: '',
  });
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = { ...form };
    if (!payload.due_date) delete payload.due_date;
    if (!payload.due_time) delete payload.due_time;
    if (!payload.room_id) delete payload.room_id;
    if (!payload.assigned_to) delete payload.assigned_to;
    if (!payload.recurrence_rule) { delete payload.recurrence_rule; payload.is_recurring = 0; }
    if (checklist.length > 0) payload.checklist = checklist.map(label => ({ label }));

    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) onCreated();
  };

  const addChecklistItem = () => {
    if (newItem.trim()) { setChecklist([...checklist, newItem.trim()]); setNewItem(''); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-4">New Task</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Time</label>
              <input type="time" value={form.due_time} onChange={e => setForm({ ...form, due_time: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Room</label>
              <select value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">None</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assign To</label>
              <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Recurrence</label>
            <select value={form.recurrence_rule} onChange={e => setForm({ ...form, recurrence_rule: e.target.value, is_recurring: e.target.value ? 1 : 0 })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <option value="">One-time</option>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option>
            </select>
          </div>

          {/* Checklist */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Checklist</label>
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                <span className="flex-1 text-sm text-gray-700">{item}</span>
                <button onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                placeholder="Add checklist item..." className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              <button onClick={addChecklistItem} className="text-sm text-blue-600 hover:text-blue-700">Add</button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.title.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
