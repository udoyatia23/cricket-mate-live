import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Search, CheckCircle, Clock, XCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserRecord {
  id: string;
  email: string;
  name: string;
  phone_number: string;
  status: string;
  subscription_end: string | null;
  notes: string;
  created_at: string;
}

const statusColor = (s: string) => {
  if (s === 'active') return 'text-green-500';
  if (s === 'pending') return 'text-yellow-500';
  return 'text-red-500';
};

const statusIcon = (s: string) => {
  if (s === 'active') return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (s === 'pending') return <Clock className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
};

const AdminUsers = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, Partial<UserRecord>>>({});
  const { toast } = useToast();

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const loadUsers = async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/get-users`,
      { headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
    );
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const saveAccess = async (userId: string) => {
    const edit = editState[userId] ?? {};
    const user = users.find(u => u.id === userId)!;
    setSaving(userId);

    const token = await getToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/update-user-access`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          status: edit.status ?? user.status,
          subscription_end: edit.subscription_end ?? user.subscription_end,
          notes: edit.notes ?? user.notes,
        }),
      }
    );
    const result = await res.json();
    setSaving(null);
    if (result.success) {
      toast({ title: 'Updated', description: 'User access updated successfully.' });
      await loadUsers();
      setExpanded(null);
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const token = await getToken();
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/delete-user`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      }
    );
    await loadUsers();
    toast({ title: 'User deleted' });
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Users</h2>
            <p className="text-muted-foreground text-sm">{users.length} registered users</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9 bg-secondary border-border"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">No users found</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(user => {
              const isExpanded = expanded === user.id;
              const edit = editState[user.id] ?? {};
              const currentStatus = edit.status ?? user.status;

              // Check if subscription expired
              const subEnd = edit.subscription_end ?? user.subscription_end;
              const isExpiredSub = subEnd && new Date(subEnd) < new Date();

              return (
                <div key={user.id} className="gradient-card rounded-xl border border-border overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : user.id)}
                  >
                    <div className="flex-shrink-0">{statusIcon(currentStatus)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{user.name || '(no name)'}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className={cn('text-xs font-semibold capitalize', statusColor(currentStatus))}>{currentStatus}</p>
                      {subEnd && (
                        <p className={cn('text-xs', isExpiredSub ? 'text-red-500' : 'text-muted-foreground')}>
                          {isExpiredSub ? '⚠ Expired' : `Until ${new Date(subEnd).toLocaleDateString('en-BD', { timeZone: 'Asia/Dhaka' })}`}
                        </p>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-4 bg-secondary/20">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs mb-0.5">Phone</p>
                          <p>{user.phone_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs mb-0.5">Joined</p>
                          <p>{new Date(user.created_at).toLocaleDateString('en-BD', { timeZone: 'Asia/Dhaka' })}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">Status</Label>
                          <select
                            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                            value={currentStatus}
                            onChange={e => setEditState(prev => ({ ...prev, [user.id]: { ...prev[user.id], status: e.target.value } }))}
                          >
                            <option value="pending">Pending</option>
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Subscription End (Bangladesh Time)</Label>
                          <Input
                            type="datetime-local"
                            className="mt-1 bg-background border-input text-sm"
                            value={subEnd ? new Date(subEnd).toISOString().slice(0, 16) : ''}
                            onChange={e => setEditState(prev => ({ ...prev, [user.id]: { ...prev[user.id], subscription_end: e.target.value ? new Date(e.target.value).toISOString() : null } }))}
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">Notes (optional)</Label>
                        <Input
                          className="mt-1 bg-background border-input text-sm"
                          placeholder="e.g. Monthly plan - paid via bKash"
                          value={edit.notes ?? user.notes ?? ''}
                          onChange={e => setEditState(prev => ({ ...prev, [user.id]: { ...prev[user.id], notes: e.target.value } }))}
                        />
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveAccess(user.id)}
                          disabled={saving === user.id}
                        >
                          {saving === user.id ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
