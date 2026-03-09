import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth, usePermission } from '../context/auth.tsx';
import { useToast } from '../components/Toast.tsx';
import type { RoomRow, StaffUserRow, StudioSettingsRow } from '@studioflow360/shared';

type EditingRoom = {
  name: string;
  description: string;
  capacity: number;
  hourly_rate: number;
  color_hex: string;
};

type SettingsTab = 'studio' | 'rooms' | 'staff';

export function SettingsPage() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const canManageStaff = usePermission('staff.manage');
  const canManageRooms = usePermission('rooms.manage');
  const isAdmin = staff?.role === 'admin';
  const [tab, setTab] = useState<SettingsTab>('studio');
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

  // Studio settings state
  const [studioSettings, setStudioSettings] = useState<(StudioSettingsRow & { logo_url: string | null }) | null>(null);
  const [studioForm, setStudioForm] = useState({
    studio_name: '', studio_subtitle: '', studio_address: '', studio_email: '', studio_phone: '', studio_website: '',
    invoice_payment_terms: '', invoice_bank_details: '', invoice_notes: '', invoice_tax_rate: 20, invoice_currency: 'GBP', invoice_due_days: 14,
  });
  const [studioSaving, setStudioSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const fetchStudioSettings = async () => {
    const res = await api.get<StudioSettingsRow & { logo_url: string | null }>('/settings/studio');
    if (res.success && res.data) {
      setStudioSettings(res.data);
      setStudioForm({
        studio_name: res.data.studio_name ?? '',
        studio_subtitle: res.data.studio_subtitle ?? '',
        studio_address: res.data.studio_address ?? '',
        studio_email: res.data.studio_email ?? '',
        studio_phone: res.data.studio_phone ?? '',
        studio_website: res.data.studio_website ?? '',
        invoice_payment_terms: res.data.invoice_payment_terms ?? '',
        invoice_bank_details: res.data.invoice_bank_details ?? '',
        invoice_notes: res.data.invoice_notes ?? '',
        invoice_tax_rate: res.data.invoice_tax_rate ?? 20,
        invoice_currency: res.data.invoice_currency ?? 'GBP',
        invoice_due_days: res.data.invoice_due_days ?? 14,
      });
    }
  };

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

  useEffect(() => { fetchRooms(); fetchStaff(); fetchStudioSettings(); }, []);

  // --- Studio settings handlers ---
  const saveStudioSettings = async () => {
    setStudioSaving(true);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(studioForm)) {
      if (typeof value === 'string' && !value.trim()) {
        payload[key] = ['studio_name'].includes(key) ? undefined : null;
      } else {
        payload[key] = value;
      }
    }
    // Don't send studio_name if empty
    if (!studioForm.studio_name.trim()) { setStudioSaving(false); toast('Studio name is required', 'error'); return; }
    const res = await api.patch('/settings/studio', payload);
    if (res.success) { toast('Studio settings saved', 'success'); fetchStudioSettings(); }
    else { toast(res.error?.message ?? 'Failed to save', 'error'); }
    setStudioSaving(false);
  };

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    const formData = new FormData();
    formData.append('logo', file);
    const res = await api.upload('/settings/studio/logo', formData);
    if (res.success) { toast('Logo uploaded', 'success'); fetchStudioSettings(); }
    else { toast(res.error?.message ?? 'Upload failed', 'error'); }
    setLogoUploading(false);
  };

  const removeLogo = async () => {
    if (!confirm('Remove the studio logo?')) return;
    const res = await api.delete('/settings/studio/logo');
    if (res.success) { toast('Logo removed', 'success'); fetchStudioSettings(); }
    else { toast(res.error?.message ?? 'Failed', 'error'); }
  };

  // --- Room handlers ---
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
    setEditForm({ name: room.name, description: room.description ?? '', capacity: room.capacity, hourly_rate: room.hourly_rate, color_hex: room.color_hex });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    const res = await api.patch(`/rooms/${editingId}`, editForm);
    if (res.success) { toast('Room updated', 'success'); cancelEdit(); fetchRooms(); }
    else { toast(res.error?.message ?? 'Failed to update room', 'error'); }
  };

  const toggleActive = async (room: RoomRow) => {
    const res = await api.patch(`/rooms/${room.id}`, { active: room.active ? 0 : 1 });
    if (res.success) { toast(`Room ${room.active ? 'deactivated' : 'activated'}`, 'success'); fetchRooms(); }
    else { toast(res.error?.message ?? 'Failed to update room', 'error'); }
  };

  const deleteRoom = async (room: RoomRow) => {
    if (!confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    const res = await api.delete(`/rooms/${room.id}`);
    if (res.success) { toast('Room deleted', 'success'); fetchRooms(); }
    else { toast(res.error?.message ?? 'Failed to delete room', 'error'); }
  };

  // --- Staff handlers ---
  const addStaff = async () => {
    if (!newStaff.access_email.trim() || !newStaff.display_name.trim()) return;
    const res = await api.post('/staff', newStaff);
    if (res.success) {
      toast('Staff member added', 'success');
      setShowAddStaff(false);
      setNewStaff({ access_email: '', display_name: '', role: 'staff' });
      fetchStaff();
    } else { toast(res.error?.message ?? 'Failed to add staff', 'error'); }
  };

  const updateStaffRole = async (memberId: string, role: string) => {
    const res = await api.patch(`/staff/${memberId}`, { role });
    if (res.success) { toast('Role updated', 'success'); setEditingStaffId(null); fetchStaff(); }
    else { toast(res.error?.message ?? 'Failed to update role', 'error'); }
  };

  const toggleStaffActive = async (member: StaffUserRow) => {
    if (member.id === staff?.id) { toast('Cannot deactivate yourself', 'error'); return; }
    const res = await api.patch(`/staff/${member.id}`, { active: member.active ? 0 : 1 });
    if (res.success) { toast(`Staff ${member.active ? 'deactivated' : 'activated'}`, 'success'); fetchStaff(); }
    else { toast(res.error?.message ?? 'Failed to update staff', 'error'); }
  };

  const deleteStaff = async (member: StaffUserRow) => {
    if (member.id === staff?.id) { toast('Cannot delete yourself', 'error'); return; }
    if (!confirm(`Remove "${member.display_name}" from the team? They will lose access.`)) return;
    const res = await api.delete(`/staff/${member.id}`);
    if (res.success) { toast('Staff member removed', 'success'); fetchStaff(); }
    else { toast(res.error?.message ?? 'Failed to remove staff', 'error'); }
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

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 focus:outline-none';
  const labelCls = 'mb-1 block text-[11px] font-medium text-gray-500';

  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">Settings</h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {([
          { key: 'studio' as SettingsTab, label: 'Studio & Invoices' },
          { key: 'rooms' as SettingsTab, label: 'Rooms' },
          { key: 'staff' as SettingsTab, label: 'Staff Team' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Studio & Invoices Tab */}
      {tab === 'studio' && (
        <div className="space-y-6">
          {/* Studio Branding */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Studio Branding</h2>
            <p className="mb-5 text-xs text-gray-500">Your studio name and logo appear on invoices and documents</p>

            {/* Logo */}
            <div className="mb-6 flex items-center gap-5">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
                {studioSettings?.logo_url ? (
                  <img src={studioSettings.logo_url} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Studio Logo</p>
                <p className="mb-2 text-xs text-gray-400">PNG, JPG, SVG or WebP. Max 2MB.</p>
                <div className="flex gap-2">
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
                  <button className="btn btn-primary text-xs" disabled={logoUploading || !isAdmin} onClick={() => logoInputRef.current?.click()}>
                    {logoUploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                  {studioSettings?.logo_url && (
                    <button className="btn btn-ghost text-xs text-red-600 hover:bg-red-50" disabled={!isAdmin} onClick={removeLogo}>Remove</button>
                  )}
                </div>
                {!isAdmin && <p className="mt-1 text-[10px] text-amber-600">Only admins can change the logo</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div>
                <label className={labelCls}>Studio Name</label>
                <input className={inputCls} value={studioForm.studio_name} onChange={(e) => setStudioForm(s => ({ ...s, studio_name: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Subtitle / Tagline</label>
                <input className={inputCls} placeholder="e.g. Content Creation Studios" value={studioForm.studio_subtitle} onChange={(e) => setStudioForm(s => ({ ...s, studio_subtitle: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input className={inputCls} value={studioForm.studio_address} onChange={(e) => setStudioForm(s => ({ ...s, studio_address: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} type="email" value={studioForm.studio_email} onChange={(e) => setStudioForm(s => ({ ...s, studio_email: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} value={studioForm.studio_phone} onChange={(e) => setStudioForm(s => ({ ...s, studio_phone: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Website</label>
                <input className={inputCls} value={studioForm.studio_website} onChange={(e) => setStudioForm(s => ({ ...s, studio_website: e.target.value }))} disabled={!isAdmin} />
              </div>
            </div>
          </div>

          {/* Invoice Defaults */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Invoice Defaults</h2>
            <p className="mb-5 text-xs text-gray-500">Default values for new invoices and invoice templates</p>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <div>
                <label className={labelCls}>Default Tax Rate (%)</label>
                <input className={inputCls} type="number" min="0" max="100" value={studioForm.invoice_tax_rate} onChange={(e) => setStudioForm(s => ({ ...s, invoice_tax_rate: Number(e.target.value) }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <select className={inputCls} value={studioForm.invoice_currency} onChange={(e) => setStudioForm(s => ({ ...s, invoice_currency: e.target.value }))} disabled={!isAdmin}>
                  <option value="GBP">GBP ({'\u00A3'})</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR ({'\u20AC'})</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Payment Due (days)</label>
                <input className={inputCls} type="number" min="1" max="365" value={studioForm.invoice_due_days} onChange={(e) => setStudioForm(s => ({ ...s, invoice_due_days: Number(e.target.value) }))} disabled={!isAdmin} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className={labelCls}>Payment Terms</label>
                <textarea className={inputCls + ' min-h-[80px] resize-y'} rows={3} placeholder="e.g. Payment due within 14 days of invoice date." value={studioForm.invoice_payment_terms} onChange={(e) => setStudioForm(s => ({ ...s, invoice_payment_terms: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div>
                <label className={labelCls}>Bank Details</label>
                <textarea className={inputCls + ' min-h-[80px] resize-y'} rows={3} placeholder="e.g. Sort: 12-34-56, Account: 12345678" value={studioForm.invoice_bank_details} onChange={(e) => setStudioForm(s => ({ ...s, invoice_bank_details: e.target.value }))} disabled={!isAdmin} />
              </div>
              <div className="lg:col-span-2">
                <label className={labelCls}>Default Invoice Notes</label>
                <textarea className={inputCls + ' min-h-[60px] resize-y'} rows={2} placeholder="Appears on every invoice footer" value={studioForm.invoice_notes} onChange={(e) => setStudioForm(s => ({ ...s, invoice_notes: e.target.value }))} disabled={!isAdmin} />
              </div>
            </div>

            {isAdmin && (
              <div className="mt-5 flex justify-end">
                <button className="btn btn-success" onClick={saveStudioSettings} disabled={studioSaving}>
                  {studioSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rooms Tab */}
      {tab === 'rooms' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Rooms</h2>
              <p className="text-xs text-gray-500">Manage studio rooms and spaces</p>
            </div>
            {canManageRooms && (
              <button className={`btn ${showAddRoom ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setShowAddRoom(!showAddRoom)}>
                {showAddRoom ? 'Cancel' : '+ Add Room'}
              </button>
            )}
          </div>

          {showAddRoom && canManageRooms && (
            <div className="border-b border-gray-100 bg-blue-50/50 p-6">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Room</h3>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <div>
                  <label className={labelCls}>Room Name</label>
                  <input className={inputCls} placeholder="e.g. Studio A" value={newRoom.name} onChange={(e) => setNewRoom(r => ({ ...r, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Description</label>
                  <input className={inputCls} placeholder="Optional description" value={newRoom.description} onChange={(e) => setNewRoom(r => ({ ...r, description: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Capacity</label>
                  <input className={inputCls} type="number" value={newRoom.capacity} onChange={(e) => setNewRoom(r => ({ ...r, capacity: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={labelCls}>Hourly Rate</label>
                  <input className={inputCls} type="number" step="0.01" value={newRoom.hourly_rate} onChange={(e) => setNewRoom(r => ({ ...r, hourly_rate: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <div className="flex items-center gap-2">
                    <input className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200" type="color" value={newRoom.color_hex} onChange={(e) => setNewRoom(r => ({ ...r, color_hex: e.target.value }))} />
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
                              <input className="h-8 w-8 cursor-pointer rounded border border-gray-200" type="color" value={editForm.color_hex} onChange={(e) => setEditForm(f => f && ({ ...f, color_hex: e.target.value }))} />
                              <input className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={editForm.name} onChange={(e) => setEditForm(f => f && ({ ...f, name: e.target.value }))} />
                            </div>
                          </td>
                          <td className="py-3">
                            <input className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" type="number" value={editForm.capacity} onChange={(e) => setEditForm(f => f && ({ ...f, capacity: Number(e.target.value) }))} />
                          </td>
                          <td className="py-3">
                            <input className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" type="number" step="0.01" value={editForm.hourly_rate} onChange={(e) => setEditForm(f => f && ({ ...f, hourly_rate: Number(e.target.value) }))} />
                          </td>
                          <td className="py-3"><span className="text-xs text-gray-400">{'\u2014'}</span></td>
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
                                {room.description && <p className="text-[11px] text-gray-400">{room.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 text-gray-600">{room.capacity} people</td>
                          <td className="py-3.5 font-medium text-gray-900">{'\u00A3'}{room.hourly_rate.toFixed(2)}/hr</td>
                          <td className="py-3.5">
                            {canManageRooms ? (
                              <button onClick={() => toggleActive(room)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${room.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${room.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                                {room.active ? 'Active' : 'Inactive'}
                              </button>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${room.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${room.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                                {room.active ? 'Active' : 'Inactive'}
                              </span>
                            )}
                          </td>
                          {canManageRooms && (
                            <td className="py-3.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button className="btn btn-ghost py-1 text-xs" onClick={() => startEdit(room)}>Edit</button>
                                <button className="btn btn-ghost py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => deleteRoom(room)}>Delete</button>
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
      )}

      {/* Staff Tab */}
      {tab === 'staff' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Staff Team</h2>
              <p className="text-xs text-gray-500">{canManageStaff ? 'Manage team members, roles, and access' : 'View team members'}</p>
            </div>
            {canManageStaff && (
              <button className={`btn ${showAddStaff ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setShowAddStaff(!showAddStaff)}>
                {showAddStaff ? 'Cancel' : '+ Add Staff'}
              </button>
            )}
          </div>

          {showAddStaff && canManageStaff && (
            <div className="border-b border-gray-100 bg-blue-50/50 p-6">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">New Staff Member</h3>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div>
                  <label className={labelCls}>Display Name</label>
                  <input className={inputCls} placeholder="John Smith" value={newStaff.display_name} onChange={(e) => setNewStaff(s => ({ ...s, display_name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Email (Cloudflare Access)</label>
                  <input className={inputCls} type="email" placeholder="john@company.com" value={newStaff.access_email} onChange={(e) => setNewStaff(s => ({ ...s, access_email: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select className={inputCls} value={newStaff.role} onChange={(e) => setNewStaff(s => ({ ...s, role: e.target.value as 'admin' | 'manager' | 'staff' }))}>
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
                            {member.id === staff?.id && <span className="ml-1.5 text-[10px] text-gray-400">(you)</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 text-gray-600">{member.access_email}</td>
                      <td className="py-3.5">
                        {editingStaffId === member.id && canManageStaff ? (
                          <div className="flex items-center gap-1.5">
                            <select className="rounded-lg border border-gray-200 px-2 py-1 text-xs" value={editStaffRole} onChange={(e) => setEditStaffRole(e.target.value)}>
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
                          }`}>{member.role}</span>
                        )}
                      </td>
                      <td className="py-3.5">
                        {canManageStaff && member.id !== staff?.id ? (
                          <button onClick={() => toggleStaffActive(member)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${member.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${member.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                            {member.active ? 'Active' : 'Inactive'}
                          </button>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${member.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${member.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                            {member.active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      {canManageStaff && (
                        <td className="py-3.5 text-right">
                          {member.id !== staff?.id && (
                            <div className="flex justify-end gap-1.5">
                              <button className="btn btn-ghost py-1 text-xs" onClick={() => { setEditingStaffId(member.id); setEditStaffRole(member.role); }}>Change Role</button>
                              <button className="btn btn-ghost py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => deleteStaff(member)}>Remove</button>
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
      )}
    </div>
  );
}
