import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth, usePermission } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';
import type { RoomRow, StaffUserRow } from '@studioflow360/shared';

type EditingRoom = {
  name: string;
  description: string;
  capacity: number;
  hourly_rate: number;
  color_hex: string;
};

export function SettingsPage() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const canManageStaff = usePermission('staff.manage');
  const canManageRooms = usePermission('rooms.manage');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditingRoom | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffRole, setEditStaffRole] = useState<string>('staff');
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: '',
    capacity: 10,
    hourly_rate: 50,
    color_hex: '#3B82F6',
  });
  const [newStaff, setNewStaff] = useState({
    access_email: '',
    display_name: '',
    role: 'staff' as 'admin' | 'manager' | 'staff',
  });

  const fetchRooms = async () => {
    const res = await api.get<RoomRow[]>('/rooms');
    if (res.success && res.data) setRooms(res.data);
    setLoading(false);
  };

  const fetchStaff = async () => {
    const endpoint = canManageStaff ? '/staff' : '/staff/list';
    const res = await api.get<StaffUserRow[]>(endpoint);
    if (res.success && res.data) setStaffMembers(res.data);
  };

  useEffect(() => { fetchRooms(); fetchStaff(); }, []);

  const addRoom = async () => {
    if (!newRoom.name.trim()) return;
    const res = await api.post('/rooms', newRoom);
    if (res.success) {
      toast('Room created', 'success');
      setShowAddRoom(false);
      setNewRoom({ name: '', description: '', capacity: 10, hourly_rate: 50, color_hex: '#3B82F6' });
      fetchRooms();
    } else {
      toast(res.error?.message ?? 'Failed to create room', 'error');
    }
  };

  const startEdit = (room: RoomRow) => {
    setEditingId(room.id);
    setEditForm({
      name: room.name,
      description: room.description ?? '',
      capacity: room.capacity,
      hourly_rate: room.hourly_rate,
      color_hex: room.color_hex,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    const res = await api.patch(`/rooms/${editingId}`, editForm);
    if (res.success) {
      toast('Room updated', 'success');
      cancelEdit();
      fetchRooms();
    } else {
      toast(res.error?.message ?? 'Failed to update room', 'error');
    }
  };

  const toggleActive = async (room: RoomRow) => {
    const res = await api.patch(`/rooms/${room.id}`, { active: room.active ? 0 : 1 });
    if (res.success) {
      toast(`Room ${room.active ? 'deactivated' : 'activated'}`, 'success');
      fetchRooms();
    } else {
      toast(res.error?.message ?? 'Failed to update room', 'error');
    }
  };

  const deleteRoom = async (room: RoomRow) => {
    if (!confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    const res = await api.delete(`/rooms/${room.id}`);
    if (res.success) {
      toast('Room deleted', 'success');
      fetchRooms();
    } else {
      toast(res.error?.message ?? 'Failed to delete room', 'error');
    }
  };

  const addStaff = async () => {
    if (!newStaff.access_email.trim() || !newStaff.display_name.trim()) return;
    const res = await api.post('/staff', newStaff);
    if (res.success) {
      toast('Staff member added', 'success');
      setShowAddStaff(false);
      setNewStaff({ access_email: '', display_name: '', role: 'staff' });
      fetchStaff();
    } else {
      toast(res.error?.message ?? 'Failed to add staff', 'error');
    }
  };

  const updateStaffRole = async (memberId: string, role: string) => {
    const res = await api.patch(`/staff/${memberId}`, { role });
    if (res.success) {
      toast('Role updated', 'success');
      setEditingStaffId(null);
      fetchStaff();
    } else {
      toast(res.error?.message ?? 'Failed to update role', 'error');
    }
  };

  const toggleStaffActive = async (member: StaffUserRow) => {
    if (member.id === staff?.id) { toast('Cannot deactivate yourself', 'error'); return; }
    const res = await api.patch(`/staff/${member.id}`, { active: member.active ? 0 : 1 });
    if (res.success) {
      toast(`Staff ${member.active ? 'deactivated' : 'activated'}`, 'success');
      fetchStaff();
    } else {
      toast(res.error?.message ?? 'Failed to update staff', 'error');
    }
  };

  const deleteStaff = async (member: StaffUserRow) => {
    if (member.id === staff?.id) { toast('Cannot delete yourself', 'error'); return; }
    if (!confirm(`Remove "${member.display_name}" from the team? They will lose access.`)) return;
    const res = await api.delete(`/staff/${member.id}`);
    if (res.success) {
      toast('Staff member removed', 'success');
      fetchStaff();
    } else {
      toast(res.error?.message ?? 'Failed to remove staff', 'error');
    }
  };

  if (!usePermission('settings.view')) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-900">Access Restricted</p>
        <p className="mt-1 text-sm text-gray-500">Settings are only accessible to admin and manager roles.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-gray-900">Settings</h1>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Rooms</h2>
            <p className="text-xs text-gray-500">Manage studio rooms and spaces</p>
          </div>
          {canManageRooms && (
            <button
              className={`btn ${showAddRoom ? 'btn-ghost' : 'btn-primary'}`}
              onClick={() => setShowAddRoom(!showAddRoom)}
            >
              {showAddRoom ? 'Cancel' : '+ Add Room'}
            </button>
          )}
        </div>

        {showAddRoom && canManageRooms && (
          <div className="border-b border-gray-100 bg-blue-50/50 p-6">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Room</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Room Name</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  placeholder="e.g. Studio A"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom((r) => ({ ...r, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Description</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  placeholder="Optional description"
                  value={newRoom.description}
                  onChange={(e) => setNewRoom((r) => ({ ...r, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Capacity</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  type="number"
                  value={newRoom.capacity}
                  onChange={(e) => setNewRoom((r) => ({ ...r, capacity: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Hourly Rate</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  type="number"
                  step="0.01"
                  value={newRoom.hourly_rate}
                  onChange={(e) => setNewRoom((r) => ({ ...r, hourly_rate: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200"
                    type="color"
                    value={newRoom.color_hex}
                    onChange={(e) => setNewRoom((r) => ({ ...r, color_hex: e.target.value }))}
                  />
                  <span className="text-xs text-gray-500">{newRoom.color_hex}</span>
                </div>
              </div>
              <div className="flex items-end">
                <button className="btn btn-success w-full" onClick={addRoom}>Save Room</button>
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          {loading ? (
            <div className="skeleton h-32" />
          ) : rooms.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">No rooms yet. Add your first room above.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Room</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Capacity</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Rate</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  {canManageRooms && <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    {editingId === room.id && editForm ? (
                      <>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <input
                              className="h-8 w-8 cursor-pointer rounded border border-gray-200"
                              type="color"
                              value={editForm.color_hex}
                              onChange={(e) => setEditForm((f) => f && ({ ...f, color_hex: e.target.value }))}
                            />
                            <input
                              className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                              value={editForm.name}
                              onChange={(e) => setEditForm((f) => f && ({ ...f, name: e.target.value }))}
                            />
                          </div>
                        </td>
                        <td className="py-3">
                          <input
                            className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                            type="number"
                            value={editForm.capacity}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, capacity: Number(e.target.value) }))}
                          />
                        </td>
                        <td className="py-3">
                          <input
                            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                            type="number"
                            step="0.01"
                            value={editForm.hourly_rate}
                            onChange={(e) => setEditForm((f) => f && ({ ...f, hourly_rate: Number(e.target.value) }))}
                          />
                        </td>
                        <td className="py-3">
                          <span className="text-xs text-gray-400">{'\u2014'}</span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button className="btn btn-success py-1 text-xs" onClick={saveEdit}>Save</button>
                            <button className="btn btn-ghost py-1 text-xs" onClick={cancelEdit}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 rounded" style={{ backgroundColor: room.color_hex }} />
                            <div>
                              <span className="font-semibold text-gray-900">{room.name}</span>
                              {room.description && (
                                <p className="text-[11px] text-gray-400">{room.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 text-gray-600">{room.capacity} people</td>
                        <td className="py-3.5 font-medium text-gray-900">{'\u00A3'}{room.hourly_rate.toFixed(2)}/hr</td>
                        <td className="py-3.5">
                          {canManageRooms ? (
                            <button
                              onClick={() => toggleActive(room)}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                room.active
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${room.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                              {room.active ? 'Active' : 'Inactive'}
                            </button>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              room.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${room.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                              {room.active ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </td>
                        {canManageRooms && (
                          <td className="py-3.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                className="btn btn-ghost py-1 text-xs"
                                onClick={() => startEdit(room)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-ghost py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => deleteRoom(room)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Staff Team */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Staff Team</h2>
            <p className="text-xs text-gray-500">
              {canManageStaff ? 'Manage team members, roles, and access' : 'View team members'}
            </p>
          </div>
          {canManageStaff && (
            <button
              className={`btn ${showAddStaff ? 'btn-ghost' : 'btn-primary'}`}
              onClick={() => setShowAddStaff(!showAddStaff)}
            >
              {showAddStaff ? 'Cancel' : '+ Add Staff'}
            </button>
          )}
        </div>

        {showAddStaff && canManageStaff && (
          <div className="border-b border-gray-100 bg-blue-50/50 p-6">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Staff Member</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Display Name</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  placeholder="John Smith"
                  value={newStaff.display_name}
                  onChange={(e) => setNewStaff((s) => ({ ...s, display_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Email (Cloudflare Access)</label>
                <input
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  type="email"
                  placeholder="john@company.com"
                  value={newStaff.access_email}
                  onChange={(e) => setNewStaff((s) => ({ ...s, access_email: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-500">Role</label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm"
                  value={newStaff.role}
                  onChange={(e) => setNewStaff((s) => ({ ...s, role: e.target.value as 'admin' | 'manager' | 'staff' }))}
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-end">
                <button className="btn btn-success w-full" onClick={addStaff}>Add Member</button>
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          {staffMembers.length === 0 ? (
            <div className="skeleton h-32" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Name</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Role</th>
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  {canManageStaff && <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {staffMembers.map((member) => (
                  <tr key={member.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
                          {member.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900">{member.display_name}</span>
                          {member.id === staff?.id && (
                            <span className="ml-1.5 text-[10px] text-gray-400">(you)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 text-gray-600">{member.access_email}</td>
                    <td className="py-3.5">
                      {editingStaffId === member.id && canManageStaff ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
                            value={editStaffRole}
                            onChange={(e) => setEditStaffRole(e.target.value)}
                          >
                            <option value="staff">Staff</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button className="btn btn-success py-0.5 text-[10px]" onClick={() => updateStaffRole(member.id, editStaffRole)}>Save</button>
                          <button className="btn btn-ghost py-0.5 text-[10px]" onClick={() => setEditingStaffId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          member.role === 'admin' ? 'bg-purple-50 text-purple-700'
                          : member.role === 'manager' ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {member.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5">
                      {canManageStaff && member.id !== staff?.id ? (
                        <button
                          onClick={() => toggleStaffActive(member)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            member.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${member.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                          {member.active ? 'Active' : 'Inactive'}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          member.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${member.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                          {member.active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    {canManageStaff && (
                      <td className="py-3.5 text-right">
                        {member.id !== staff?.id && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              className="btn btn-ghost py-1 text-xs"
                              onClick={() => { setEditingStaffId(member.id); setEditStaffRole(member.role); }}
                            >
                              Change Role
                            </button>
                            <button
                              className="btn btn-ghost py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => deleteStaff(member)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
