import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from './AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Image, Lock, ImagePlay } from 'lucide-react';

const AdminSettings = () => {
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const { toast } = useToast();

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('app_settings').select('key, value');
      data?.forEach(s => {
        if (s.key === 'logo_url') setLogoUrl(s.value ?? '');
        if (s.key === 'banner_url') setBannerUrl(s.value ?? '');
      });
    };
    loadSettings();
  }, []);

  const updateSetting = async (key: string, value: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/update-setting`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }
    );
    const result = await res.json();
    setLoading(false);
    if (result.success) toast({ title: 'Saved', description: `${key} updated successfully.` });
    else toast({ title: 'Error', description: result.error, variant: 'destructive' });
  };

  const changePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setSavingPw(true);
    const token = await getToken();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/change-password`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      }
    );
    const result = await res.json();
    setSavingPw(false);
    if (result.success) {
      toast({ title: 'Password Changed', description: 'Your admin password has been updated.' });
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground text-sm">Manage app appearance and admin credentials</p>
        </div>

        {/* Logo */}
        <div className="gradient-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Image className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">App Logo</h3>
          </div>
          {logoUrl && (
            <div className="rounded-lg overflow-hidden border border-border bg-secondary flex items-center justify-center h-24">
              <img src={logoUrl} alt="Logo preview" className="h-full object-contain" />
            </div>
          )}
          <div>
            <Label className="text-xs">Logo Image URL</Label>
            <Input
              className="mt-1 bg-secondary border-border"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <Button
            size="sm"
            onClick={() => updateSetting('logo_url', logoUrl, setSavingLogo)}
            disabled={savingLogo}
          >
            {savingLogo ? 'Saving...' : 'Save Logo'}
          </Button>
        </div>

        {/* Banner */}
        <div className="gradient-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <ImagePlay className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Top Banner</h3>
          </div>
          {bannerUrl && (
            <div className="rounded-lg overflow-hidden border border-border bg-secondary">
              <img src={bannerUrl} alt="Banner preview" className="w-full h-32 object-cover" />
            </div>
          )}
          <div>
            <Label className="text-xs">Banner Image URL</Label>
            <Input
              className="mt-1 bg-secondary border-border"
              value={bannerUrl}
              onChange={e => setBannerUrl(e.target.value)}
              placeholder="https://example.com/banner.jpg"
            />
          </div>
          <Button
            size="sm"
            onClick={() => updateSetting('banner_url', bannerUrl, setSavingBanner)}
            disabled={savingBanner}
          >
            {savingBanner ? 'Saving...' : 'Save Banner'}
          </Button>
        </div>

        {/* Password */}
        <div className="gradient-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Change Admin Password</h3>
          </div>
          <div>
            <Label className="text-xs">New Password</Label>
            <Input
              type="password"
              className="mt-1 bg-secondary border-border"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <Label className="text-xs">Confirm Password</Label>
            <Input
              type="password"
              className="mt-1 bg-secondary border-border"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
            />
          </div>
          <Button size="sm" onClick={changePassword} disabled={savingPw}>
            {savingPw ? 'Changing...' : 'Change Password'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
