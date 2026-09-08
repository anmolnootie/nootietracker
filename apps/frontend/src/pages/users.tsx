import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/Layout';
import { usersService } from '@/services/users.service';
import { User, UserRole } from '@po-control-tower/shared';

const ALL_ROLES = Object.values(UserRole);

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await usersService.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleRole = async (user: User, role: UserRole) => {
    const has = user.roles.includes(role);
    const roles = has ? user.roles.filter((r) => r !== role) : [...user.roles, role];
    setBusy(user.id);
    try {
      await usersService.updateRoles(user.id, roles);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (user: User) => {
    setBusy(user.id);
    try {
      if (user.isActive) await usersService.deactivate(user.id);
      else await usersService.activate(user.id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MainLayout>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Users</h2>
          <p className="text-sm text-gray-500 mt-1">Roles are assigned per user - reassigning who does what is a settings change, not a code change.</p>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Roles</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ALL_ROLES.map((role) => {
                        const active = u.roles.includes(role);
                        return (
                          <button
                            key={role}
                            disabled={busy === u.id}
                            onClick={() => toggleRole(u, role)}
                            className={`px-2 py-0.5 rounded text-xs border ${
                              active ? 'bg-nootie-orange-dark text-white border-nootie-orange-dark' : 'bg-white text-gray-500 border-gray-300'
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === u.id}
                      onClick={() => toggleActive(u)}
                      className={`px-2 py-1 rounded text-xs ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {u.isActive ? 'Active' : 'Deactivated'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MainLayout>
  );
}
