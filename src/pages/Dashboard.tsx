import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trophy, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Tournament } from '@/types/cricket';
import { getTournaments, addTournament, deleteTournament } from '@/lib/store';

const Dashboard = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    setTournaments(getTournaments());
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;
    const t: Tournament = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      matches: [],
      createdAt: new Date().toISOString(),
    };
    addTournament(t);
    setTournaments(getTournaments());
    setName('');
    setAddress('');
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteTournament(id);
    setTournaments(getTournaments());
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold tracking-wide">CricScorer</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold">My Tournaments</h1>
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
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Champions Trophy 2026"
                    className="mt-1 bg-secondary border-border"
                  />
                </div>
                <div>
                  <Label>Location / Address</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Dhaka Stadium"
                    className="mt-1 bg-secondary border-border"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate}>Create</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-24">
            <Trophy className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-2xl text-muted-foreground mb-2">No Tournaments Yet</h2>
            <p className="text-muted-foreground/70 mb-6">Create your first tournament to get started</p>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                </p>
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
