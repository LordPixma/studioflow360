import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/auth.tsx';
import { api } from '../lib/api.ts';

interface ProfileData {
  id: string;
  access_email: string;
  display_name: string;
  role: string;
  phone_number: string | null;
  bio: string | null;
  avatar_r2_key: string | null;
  avatar_url: string | null;
  job_title: string | null;
  created_at: string;
  updated_at: string | null;
}

export function ProfilePage() {
  const { staff } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const res = await api.get<ProfileData>('/me/profile');
    if (res.success && res.data) {
      setProfile(res.data);
      setDisplayName(res.data.display_name);
      setPhoneNumber(res.data.phone_number ?? '');
      setBio(res.data.bio ?? '');
      setJobTitle(res.data.job_title ?? '');
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const res = await api.patch('/me/profile', {
      display_name: displayName,
      phone_number: phoneNumber || null,
      bio: bio || null,
      job_title: jobTitle || null,
    });
    if (res.success) {
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      loadProfile();
    } else {
      setMessage({ type: 'error', text: res.error?.message ?? 'Failed to update profile' });
    }
    setSaving(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be under 2MB' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'File must be an image' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const arrayBuffer = await file.arrayBuffer();
    const response = await fetch('/api/me/profile/avatar', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: arrayBuffer,
      credentials: 'include',
    });

    const data = await response.json() as { success: boolean; error?: { message: string } };
    if (data.success) {
      setMessage({ type: 'success', text: 'Avatar uploaded' });
      loadProfile();
    } else {
      setMessage({ type: 'error', text: data.error?.message ?? 'Upload failed' });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleRemoveAvatar() {
    const res = await api.delete('/me/profile/avatar');
    if (res.success) {
      setMessage({ type: 'success', text: 'Avatar removed' });
      loadProfile();
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-48 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  const initials = (profile?.display_name ?? '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarSrc = profile?.avatar_url ? `${profile.avatar_url}?t=${Date.now()}` : null;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="mx-auto max-w-2xl py-4">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account details and preferences</p>
      </div>

      {/* Toast */}
      {message && (
        <div className={`mb-6 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium animate-fade-in ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10'
            : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10'
        }`}>
          {message.type === 'success' ? (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          )}
          {message.text}
        </div>
      )}

      {/* Avatar + Identity */}
      <div className="mb-8 rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
        <div className="flex items-center gap-5 p-6">
          {/* Avatar */}
          <div className="relative group shrink-0">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={profile?.display_name}
                className="h-20 w-20 rounded-full object-cover ring-1 ring-gray-950/[0.06]"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-900 text-2xl font-semibold text-white">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-gray-900/60 text-white opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100"
            >
              {uploading ? (
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" className="opacity-75" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{profile?.display_name}</h2>
            <p className="text-sm text-gray-500 truncate">{profile?.access_email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-gray-900 px-2 py-0.5 text-[11px] font-medium capitalize text-white">
                {profile?.role}
              </span>
              {profile?.job_title && (
                <span className="text-xs text-gray-400">{profile.job_title}</span>
              )}
              {memberSince && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs text-gray-400">Joined {memberSince}</span>
                </>
              )}
            </div>
          </div>

          {/* Upload / Remove */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {uploading ? 'Uploading...' : 'Change photo'}
            </button>
            {avatarSrc && (
              <button
                onClick={handleRemoveAvatar}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="mb-8 rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Personal Information</h3>
          <p className="mt-0.5 text-xs text-gray-400">Update your name, contact info, and bio</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <FieldGroup label="Display Name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="field-input"
              />
            </FieldGroup>
            <FieldGroup label="Job Title">
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Studio Manager"
                className="field-input"
              />
            </FieldGroup>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <FieldGroup label="Email" hint="Managed by Cloudflare Access">
              <input
                type="email"
                value={profile?.access_email ?? ''}
                disabled
                className="field-input !bg-gray-50 !text-gray-400"
              />
            </FieldGroup>
            <FieldGroup label="Phone Number">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+44 7XXX XXXXXX"
                className="field-input"
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Bio" hint={`${bio.length}/500 characters`}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="A short bio visible to your team..."
              className="field-input resize-none"
            />
          </FieldGroup>
        </div>

        <div className="flex items-center justify-end border-t border-gray-100 px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Account & Security */}
      <div className="rounded-2xl bg-white ring-1 ring-gray-950/[0.04] shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Account & Security</h3>
          <p className="mt-0.5 text-xs text-gray-400">Managed by your organisation</p>
        </div>

        <div className="divide-y divide-gray-100">
          <SettingRow label="Role" value={staff?.role ?? '—'} capitalize badge>
            <span className="text-xs text-gray-400">Assigned by admin</span>
          </SettingRow>
          <SettingRow label="Authentication" value="Cloudflare Access">
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Connected
            </span>
          </SettingRow>
          <SettingRow label="Two-Factor" value="Enforced via Zero Trust">
            <span className="inline-flex items-center gap-1 text-xs text-blue-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Protected
            </span>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

// --- Reusable sub-components ---

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-600">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function SettingRow({ label, value, capitalize, badge, children }: {
  label: string; value: string; capitalize?: boolean; badge?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          {badge ? (
            <span className={`inline-flex mt-0.5 items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 ${capitalize ? 'capitalize' : ''}`}>
              {value}
            </span>
          ) : (
            <p className="mt-0.5 text-xs text-gray-500">{value}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
