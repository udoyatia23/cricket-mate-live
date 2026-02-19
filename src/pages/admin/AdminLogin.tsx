import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn } from 'lucide-react';
import logoImg from '@/assets/cricstreampro.png';
import { useToast } from '@/hooks/use-toast';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      toast({ title: 'Login Failed', description: error.message, variant: 'destructive' });
      return;
    }

    // Verify admin role via edge function
    const session = data.session;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/check-access`,
      { headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
    );
    const result = await res.json();

    if (!result.allowed || result.role !== 'admin') {
      await supabase.auth.signOut();
      setLoading(false);
      toast({ title: 'Access Denied', description: 'You are not an admin.', variant: 'destructive' });
      return;
    }

    setLoading(false);
    navigate('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <img src={logoImg} alt="CricStream Pro" className="h-20 object-contain" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-wide">Admin Panel</h1>
          <p className="text-muted-foreground mt-1">CricStream Pro Administration</p>
        </div>

        <div className="gradient-card rounded-xl border border-border p-6 shadow-card space-y-5">
          <div>
            <Label htmlFor="email">Admin Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@info.com"
              className="mt-1 bg-secondary border-border"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="mt-1 bg-secondary border-border"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? 'Verifying...' : <><LogIn className="mr-2 h-4 w-4" /> Sign In as Admin</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
