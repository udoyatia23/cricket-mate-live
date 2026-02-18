import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [accessStatus, setAccessStatus] = useState<'checking' | 'ok' | 'denied' | 'expired'>('checking');

  useEffect(() => {
    if (!user) return;
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAccessStatus('denied'); return; }
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/check-access`,
          { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const result = await res.json();
        if (result.role === 'admin' || result.allowed) {
          setAccessStatus('ok');
        } else if (result.reason === 'expired') {
          setAccessStatus('expired');
        } else {
          setAccessStatus('denied');
        }
      } catch {
        // On edge function error, allow access
        setAccessStatus('ok');
      }
    };
    checkAccess();
  }, [user]);

  if (loading || (user && accessStatus === 'checking')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (accessStatus === 'denied') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⏳</div>
          <h2 className="text-xl font-bold">Account Pending Approval</h2>
          <p className="text-muted-foreground text-sm">Your account is awaiting admin approval. Please contact us on WhatsApp.</p>
          <a
            href="https://wa.me/8801793645711"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm"
          >
            Contact on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (accessStatus === 'expired') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold">Subscription Expired</h2>
          <p className="text-muted-foreground text-sm">Your subscription has expired. Please renew by contacting us.</p>
          <a
            href="https://wa.me/8801793645711"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm"
          >
            Renew Subscription
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
