import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/auth.tsx';
import type { RoomRow } from '@studioflow360/shared';

export function SettingsPage() {
  const { staff } = useAuth();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: '',
    capacity: 10,
    hourly_rate: 50,
    color_hex: '#3B82F6',
  });

  useEffect(() => {
    api.get<RoomRow[]>('/rooms').then((res) => {
      if (res.success && res.data) setRooms(res.data);
      setLoading(false);
    });
  }, []);

  const addRoom = async () => {
    if (!newRoom.name.trim()) return;
    const res = await api.post('/rooms', newRoom);
    if (res.success) {
      setShowAddRoom(false);
      setNewRoom({ name: '', description: '', capacity: 10, hourly_rate: 50, color_hex: '#3B82F6' });
      // Refresh
      const updated = await api.get<RoomRow[]>('/rooms');
      if (updated.success && updated.data) setRooms(updated.data);
    }
  };

  if (staff?.role !== 'admin' && staff?.role !== 'manager') {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Settings are only accessible to admin and manager roles.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      {/* Rooms */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Rooms</h2>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => setShowAddRoom(!showAddRoom)}
          >
            {showAddRoom ? 'Cancel' : 'Add Room'}
          </button>
        </div>

        {showAddRoom && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="grid grid-cols-2 gap-4">
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder="Room name"
                value={newRoom.name}
                onChange={(e) => setNewRoom((r) => ({ ...r, name: e.target.value }))}
              />
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder="Description"
                value={newRoom.description}
                onChange={(e) => setNewRoom((r) => ({ ...r, description: e.target.value }))}
              />
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                type="number"
                placeholder="Capacity"
                value={newRoom.capacity}
                onChange={(e) => setNewRoom((r) => ({ ...r, capacity: Number(e.target.value) }))}
              />
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                type="number"
                step="0.01"
                placeholder="Hourly rate"
                value={newRoom.hourly_rate}
                onChange={(e) => setNewRoom((r) => ({ ...r, hourly_rate: Number(e.target.value) }))}
              />
              <input
                className="rounded-lg border px-3 py-2 text-sm"
                type="color"
                value={newRoom.color_hex}
                onChange={(e) => setNewRoom((r) => ({ ...r, color_hex: e.target.value }))}
              />
              <button
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                onClick={addRoom}
              >
                Save Room
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-gray-200" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">Color</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Capacity</th>
                <th className="pb-2">Hourly Rate</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-gray-100">
                  <td className="py-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: room.color_hex }} />
                  </td>
                  <td className="py-3 font-medium">{room.name}</td>
                  <td className="py-3">{room.capacity}</td>
                  <td className="py-3">{room.hourly_rate.toFixed(2)}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${room.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {room.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
