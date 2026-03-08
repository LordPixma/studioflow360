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

  // Form state
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
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  const initials = (profile?.display_name ?? '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarSrc = profile?.avatar_url ? `${profile.avatar_url}?t=${Date.now()}` : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your personal information and preferences</p>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Profile Card */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
        {/* Cover Banner */}
        <div className="h-32 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />

        {/* Avatar Section */}
        <div className="relative px-8 pb-6">
          <div className="-mt-16 flex items-end gap-6">
            {/* Avatar */}
            <div className="relative group">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={profile?.display_name}
                  className="h-28 w-28 rounded-2xl border-4 border-white object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-blue-500 to-indigo-600 text-3xl font-bold text-white shadow-lg">
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                {uploading ? (
                  <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" className="opacity-75" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

            {/* Name & Role */}
            <div className="mb-2 flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{profile?.display_name}</h2>
              <div className="mt-1 flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold capitalize text-blue-700">
                  {profile?.role}
                </span>
                {profile?.job_title && (
                  <span className="text-sm text-gray-500">{profile.job_title}</span>
                )}
              </div>
            </div>

            {/* Remove avatar button */}
            {avatarSrc && (
              <button
                onClick={handleRemoveAvatar}
                className="btn btn-ghost text-xs"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Personal Information</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Studio Manager"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={profile?.access_email ?? ''}
              disabled
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">Managed by Cloudflare Access</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+44 7XXX XXXXXX"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Tell us about yourself..."
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
            />
            <p className="mt-1 text-xs text-gray-400">{bio.length}/500</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
          <p className="text-xs text-gray-400">
            Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary px-6"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Account</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Role</p>
              <p className="text-sm text-gray-500 capitalize">{staff?.role}</p>
            </div>
            <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
              Managed by admin
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Authentication</p>
              <p className="text-sm text-gray-500">Cloudflare Access (Zero Trust)</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
