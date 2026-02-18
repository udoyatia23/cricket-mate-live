import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { Users, UserCheck, Clock } from 'lucide-react';

interface Stats { total: number; active: number; pending: number; }

const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) => (
  <div className="gradient-card rounded-xl border border-border p-6 flex items-center gap-4">
    <div className={`rounded-full p-3 ${color}`}>
      <Icon className="h-6 w-6" />
    </div>
    <div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await window.fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/get-stats`,
        { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await res.json();
      setStats(data);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground text-sm">Overview of CricScorer users</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Users" value={stats.total} icon={Users} color="bg-primary/10 text-primary" />
            <StatCard label="Active Users" value={stats.active} icon={UserCheck} color="bg-green-500/10 text-green-500" />
            <StatCard label="Pending Approval" value={stats.pending} icon={Clock} color="bg-yellow-500/10 text-yellow-500" />
          </div>
        )}

        <div className="gradient-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-2">Quick Guide</h3>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li>Go to <strong>Users</strong> to approve pending users and set subscription dates</li>
            <li>Subscription dates are handled in <strong>Bangladesh Time (UTC+6)</strong></li>
            <li>Users with expired subscriptions are automatically blocked from login</li>
            <li>Go to <strong>Settings</strong> to change logo, banner, or admin password</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
