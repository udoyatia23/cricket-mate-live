import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trophy, Plus, ArrowLeft, Play, Eye, Trash2 } from 'lucide-react';
import { Tournament, Match } from '@/types/cricket';
import { getTournament, getMatchesForTournament, addMatch, deleteMatch } from '@/lib/store';

const TournamentPage = () => {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);

  // Match form state
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [overs, setOvers] = useState('20');
  const [matchNo, setMatchNo] = useState('1');
  const [tossWonBy, setTossWonBy] = useState('0');
  const [optedTo, setOptedTo] = useState<'bat' | 'bowl'>('bat');
  const [ballsPerOver, setBallsPerOver] = useState('6');
  const [matchType, setMatchType] = useState('group');

  useEffect(() => {
    if (id) {
      setTournament(getTournament(id) || null);
      setMatches(getMatchesForTournament(id));
    }
  }, [id]);

  const refreshMatches = () => {
    if (id) setMatches(getMatchesForTournament(id));
  };

  const handleCreateMatch = () => {
    if (!team1Name.trim() || !team2Name.trim() || !id) return;
    const match: Match = {
      id: crypto.randomUUID(),
      tournamentId: id,
      team1: { name: team1Name.trim(), players: [], color: '#22c55e' },
      team2: { name: team2Name.trim(), players: [], color: '#3b82f6' },
      overs: parseInt(overs),
      ballsPerOver: parseInt(ballsPerOver),
      matchNo: parseInt(matchNo),
      tossWonBy: parseInt(tossWonBy),
      optedTo,
      matchType,
      status: 'upcoming',
      innings: [],
      currentInningsIndex: -1,
      createdAt: new Date().toISOString(),
    };
    addMatch(match);
    refreshMatches();
    setTeam1Name('');
    setTeam2Name('');
    setOpen(false);
  };

  const handleDeleteMatch = (matchId: string) => {
    deleteMatch(matchId);
    refreshMatches();
  };

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Tournament not found</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    upcoming: 'bg-muted text-muted-foreground',
    live: 'bg-primary/20 text-primary',
    finished: 'bg-accent/20 text-accent',
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Trophy className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold">{tournament.name}</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {tournament.address && (
          <p className="text-muted-foreground mb-6">📍 {tournament.address}</p>
        )}

        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-bold">Matches</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Create Match</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">New Match</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Team 1</Label>
                    <Input value={team1Name} onChange={e => setTeam1Name(e.target.value)} placeholder="Team 1 Name" className="mt-1 bg-secondary" />
                  </div>
                  <div>
                    <Label>Team 2</Label>
                    <Input value={team2Name} onChange={e => setTeam2Name(e.target.value)} placeholder="Team 2 Name" className="mt-1 bg-secondary" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Overs</Label>
                    <Select value={overs} onValueChange={setOvers}>
                      <SelectTrigger className="mt-1 bg-secondary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['5','6','10','15','20','50'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Match No</Label>
                    <Input type="number" value={matchNo} onChange={e => setMatchNo(e.target.value)} className="mt-1 bg-secondary" />
                  </div>
                  <div>
                    <Label>Balls/Over</Label>
                    <Select value={ballsPerOver} onValueChange={setBallsPerOver}>
                      <SelectTrigger className="mt-1 bg-secondary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['4','5','6','8'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Toss Won By</Label>
                  <RadioGroup value={tossWonBy} onValueChange={setTossWonBy} className="flex gap-6 mt-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="0" id="toss-t1" />
                      <Label htmlFor="toss-t1">{team1Name || 'Team 1'}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="1" id="toss-t2" />
                      <Label htmlFor="toss-t2">{team2Name || 'Team 2'}</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label>Opted To</Label>
                  <RadioGroup value={optedTo} onValueChange={(v) => setOptedTo(v as 'bat' | 'bowl')} className="flex gap-6 mt-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="bat" id="opt-bat" />
                      <Label htmlFor="opt-bat">Bat</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="bowl" id="opt-bowl" />
                      <Label htmlFor="opt-bowl">Bowl</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label>Match Type</Label>
                  <Select value={matchType} onValueChange={setMatchType}>
                    <SelectTrigger className="mt-1 bg-secondary"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Group Stage</SelectItem>
                      <SelectItem value="semi">Semi Final</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateMatch}>Create Match</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {matches.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">No matches yet. Create your first match!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((m) => (
              <div key={m.id} className="gradient-card rounded-xl border border-border p-5 shadow-card hover:shadow-glow transition-all">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${statusColors[m.status]}`}>
                        {m.status}
                      </span>
                      <span className="text-xs text-muted-foreground">Match #{m.matchNo} · {m.matchType}</span>
                    </div>
                    <h3 className="font-display text-xl font-semibold">
                      {m.team1.name} <span className="text-muted-foreground mx-2">vs</span> {m.team2.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">{m.overs} overs</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/controller/${m.id}`}>
                      <Button size="sm" variant="default">
                        <Play className="mr-1 h-3 w-3" />
                        Controller
                      </Button>
                    </Link>
                    <Link to={`/scoreboard/${m.id}`}>
                      <Button size="sm" variant="secondary">
                        <Eye className="mr-1 h-3 w-3" />
                        Scoreboard
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteMatch(m.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TournamentPage;
