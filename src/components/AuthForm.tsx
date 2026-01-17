import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, LogIn, UserPlus } from 'lucide-react';

export const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = isLogin
      ? await signIn(email, password)
      : await signUp(email, password, name);

    if (result.error) {
      setError(result.error.message);
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isLogin && (
        <div className="space-y-2">
          <Label htmlFor="name" className="text-foreground">
            Fullständigt namn
          </Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ange ditt fullständiga namn"
            required={!isLogin}
            className="bg-secondary border-border"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-foreground">
          E-post
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Ange din e-postadress"
          required
          className="bg-secondary border-border"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-foreground">
          Lösenord
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Ange ditt lösenord"
          required
          minLength={6}
          className="bg-secondary border-border"
        />
      </div>

      {error && (
        <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isLogin ? (
          <>
            <LogIn className="h-4 w-4 mr-2" />
            Logga in
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4 mr-2" />
            Skapa konto
          </>
        )}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full text-muted-foreground hover:text-foreground"
        onClick={() => setIsLogin(!isLogin)}
      >
        {isLogin ? 'Har du inget konto? Registrera dig' : 'Har du redan ett konto? Logga in'}
      </Button>
    </form>
  );
};