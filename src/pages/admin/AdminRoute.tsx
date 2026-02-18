import { useEffect, useState, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const AdminRoute = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus('denied'); return; }

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/check-access`,
          { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const result = await res.json();
        setStatus(result.allowed && result.role === 'admin' ? 'ok' : 'denied');
      } catch {
        setStatus('denied');
      }
    };
    check();
  }, []);

  if (status === 'loading') return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (status === 'denied') return <Navigate to="/admin" replace />;

  return <>{children}</>;
};

export default AdminRoute;
