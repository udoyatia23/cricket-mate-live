import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trophy, Plus, Trash2, ArrowRight, LogOut, Loader2, RefreshCw } from 'lucide-react';
import { Tournament } from '@/types/cricket';
import { getTournaments, addTournament, deleteTournament } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

const Dashboard = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const loadTournaments = async () => {
    setLoading(true);
    const data = await getTournaments();
    setTournaments(data);
    setLoading(false);
  };

  useEffect(() => {
    loadTournaments();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    const t: Tournament = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      matches: [],
      createdAt: new Date().toISOString(),
    };
    await addTournament(t);
    await loadTournaments();
    setName('');
    setAddress('');
    setOpen(false);
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await deleteTournament(id);
    await loadTournaments();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold tracking-wide">CricScorer</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold">My Tournaments</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={loadTournaments} disabled={loading} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Tournament
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">New Tournament</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Tournament Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Champions Trophy 2026" className="mt-1 bg-secondary border-border" />
                  </div>
                  <div>
                    <Label>Location / Address</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Dhaka Stadium" className="mt-1 bg-secondary border-border" />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : 'Create'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="gradient-card rounded-xl border border-border p-6 shadow-card space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3 mt-2" />
                <Skeleton className="h-9 w-full mt-4" />
              </div>
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-24">
            <Trophy className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-2xl text-muted-foreground mb-2">No Tournaments Yet</h2>
            <p className="text-muted-foreground/70 mb-6">Create your first tournament to get started</p>
            <Button variant="outline" size="sm" onClick={loadTournaments}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => (
              <div key={t.id} className="gradient-card rounded-xl border border-border p-6 shadow-card hover:shadow-glow transition-all duration-300 group">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{t.name}</h3>
                    {t.address && <p className="text-sm text-muted-foreground mt-1">{t.address}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Created {new Date(t.createdAt).toLocaleDateString()}</p>
                <Link to={`/tournament/${t.id}`}>
                  <Button variant="secondary" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Open Tournament
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
