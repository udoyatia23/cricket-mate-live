import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy, LogIn, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    setLoading(true);
    // Retry up to 2 times on timeout
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (!error) {
        setLoading(false);
        navigate('/dashboard');
        return;
      }
      const msg = error?.message || JSON.stringify(error) || 'Unknown error';
      if (msg.includes('timeout') || msg.includes('504') || msg.includes('timed out')) {
        if (attempt < 2) continue; // retry
      }
      setLoading(false);
      toast({ title: 'Login Failed', description: msg.includes('timeout') || msg.includes('504') ? 'Server is waking up, please try again in a few seconds.' : msg, variant: 'destructive' });
      return;
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !name.trim() || !phone.trim()) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setLoading(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: name.trim(), phone_number: phone.trim() },
        },
      });
      if (!error) {
        setLoading(false);
        toast({ title: 'Account Created!', description: 'Please check your email to verify your account before logging in.' });
        setIsLogin(true);
        return;
      }
      const msg = error?.message || JSON.stringify(error) || 'Unknown error';
      if (msg.includes('timeout') || msg.includes('504') || msg.includes('timed out')) {
        if (attempt < 2) continue;
      }
      setLoading(false);
      toast({ title: 'Signup Failed', description: msg.includes('timeout') || msg.includes('504') ? 'Server is waking up, please try again in a few seconds.' : msg, variant: 'destructive' });
      return;
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="h-8 w-8 text-primary" />
            <span className="font-display text-3xl font-bold tracking-wide">CricScorer</span>
          </div>
          <p className="text-muted-foreground">
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {/* Form Card */}
        <div className="gradient-card rounded-xl border border-border p-6 shadow-card space-y-5">
          {!isLogin && (
            <>
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="mt-1 bg-secondary border-border"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  className="mt-1 bg-secondary border-border"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
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
              placeholder="Enter your password"
              className="mt-1 bg-secondary border-border"
              onKeyDown={e => e.key === 'Enter' && (isLogin ? handleLogin() : handleSignup())}
            />
          </div>

          <Button
            className="w-full"
            onClick={isLogin ? handleLogin : handleSignup}
            disabled={loading}
          >
            {loading ? 'Please wait...' : isLogin ? (
              <><LogIn className="mr-2 h-4 w-4" /> Sign In</>
            ) : (
              <><UserPlus className="mr-2 h-4 w-4" /> Create Account</>
            )}
          </Button>

          <div className="text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
