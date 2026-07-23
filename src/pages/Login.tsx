import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { WalletCards, Loader2, ScanFace, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  // Only allow same-origin relative paths.
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default function Login() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  useEffect(() => {
    if (user && next) {
      window.location.href = next;
    }
  }, [user, next]);

  const toEmail = (username: string) => `${username.trim().toLowerCase()}@medincome.local`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setLoading(true);
    const email = toEmail(name);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({ title: 'Login mislukt', description: 'Controleer je gebruikersnaam en wachtwoord.', variant: 'destructive' });
      return;
    }
    if (next) {
      window.location.href = next;
    }
  };

  return (
    <div className="ios-login-screen">
      <Card className="w-full max-w-md animate-fade-in shadow-lg border-border/50 rounded-3xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <WalletCards className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">MyFinState</h1>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Naam</Label>
              <Input id="name" className="h-12 rounded-xl text-base" autoCapitalize="none" autoCorrect="off" autoComplete="username" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Gebruikersnaam" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input id="password" className="h-12 rounded-xl text-base" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Wachtwoord" required minLength={6} />
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl text-base" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Inloggen
            </Button>
          </form>
          <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-muted/60 p-3 text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
              <ScanFace className="h-5 w-5" />
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-medium"><ShieldCheck className="h-3 w-3" /> Beschermd op iPhone</p>
              <p className="text-[11px] text-muted-foreground">Na het inloggen opent MyFinState met Face ID.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
