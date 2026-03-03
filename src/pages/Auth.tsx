import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogIn, UserPlus, MessageCircle, CheckCircle } from 'lucide-react';
import logoImg from '@/assets/cricstreampro.png';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    setLoading(true);

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const msg = error?.message || '';
        if (msg.includes('timeout') || msg.includes('504') || msg.includes('timed out')) {
          if (attempt < 2) continue;
        }
        setLoading(false);
        toast({
          title: 'Login Failed',
          description: msg.includes('timeout') || msg.includes('504') ? 'Server is waking up, please try again in a few seconds.' : msg,
          variant: 'destructive'
        });
        return;
      }

      // Check access permission
      const session = data.session;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/check-access`,
          { headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const result = await res.json();

        if (result.role === 'admin') {
          // Admin should use /admin panel
          await supabase.auth.signOut();
          setLoading(false);
          toast({ title: 'Use Admin Panel', description: 'Please log in at /admin', variant: 'destructive' });
          return;
        }

        if (!result.allowed) {
          await supabase.auth.signOut();
          setLoading(false);
          const msg = result.reason === 'expired'
            ? 'Your subscription has expired. Please contact the admin to renew.'
            : 'Your account is pending approval. Please contact the admin.';
          toast({ title: 'Access Denied', description: msg, variant: 'destructive' });
          return;
        }
      } catch (err) {
        console.error('Access check failed:', err);
        await supabase.auth.signOut();
        setLoading(false);
        toast({ title: 'Connection Error', description: 'সার্ভারের সাথে সংযোগ করা যায়নি। আবার চেষ্টা করুন।', variant: 'destructive' });
        return;
      }

      setLoading(false);
      navigate('/dashboard');
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
        setShowSuccessPopup(true);
        return;
      }
      const msg = error?.message || '';
      if (msg.includes('timeout') || msg.includes('504') || msg.includes('timed out')) {
        if (attempt < 2) continue;
      }
      setLoading(false);
      toast({
        title: 'Signup Failed',
        description: msg.includes('timeout') || msg.includes('504') ? 'Server is waking up, please try again in a few seconds.' : msg,
        variant: 'destructive'
      });
      return;
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <img src={logoImg} alt="CricStream Pro" className="h-20 object-contain" />
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
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your full name" className="mt-1 bg-secondary border-border" />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter your phone number" className="mt-1 bg-secondary border-border" />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" className="mt-1 bg-secondary border-border" />
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

          <Button className="w-full" onClick={isLogin ? handleLogin : handleSignup} disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? (
              <><LogIn className="mr-2 h-4 w-4" /> Sign In</>
            ) : (
              <><UserPlus className="mr-2 h-4 w-4" /> Create Account</>
            )}
          </Button>

          <div className="text-center">
            <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:underline">
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>

      {/* Success Popup */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
          <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center space-y-5 shadow-2xl">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-500/10 p-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">অ্যাকাউন্ট তৈরি সফল হয়েছে!</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে। অ্যাপ্লিকেশনটি ব্যবহার করতে চাইলে কর্তৃপক্ষের সাথে যোগাযোগ করুন।
              </p>
            </div>
            <a
              href="https://wa.me/8801793645711?text=আমি CricScorer ব্যবহার করতে চাই। আমার ইমেল: "
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp এ যোগাযোগ করুন
            </a>
            <button
              onClick={() => { setShowSuccessPopup(false); setIsLogin(true); }}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auth;
