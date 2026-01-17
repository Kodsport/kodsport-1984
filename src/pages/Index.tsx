import { useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/AuthForm';
import { CompetitorCapture } from '@/components/CompetitorCapture';
import { AdminDashboard } from '@/components/AdminDashboard';
import { Header } from '@/components/Header';
import { Logo } from '@/components/Logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Monitor } from 'lucide-react';

const Index = () => {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not logged in - show auth form
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md animate-fade-in">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-6">
                <Logo />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Anti-Cheat Monitor
              </h1>
              <p className="text-muted-foreground">
                Sign in to start monitoring or participate in the competition
              </p>
            </div>

            <Card className="glass-panel card-elevated">
              <CardContent className="pt-6">
                <AuthForm />
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Powered by Programmeringsolympiaden
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Admin view
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Tabs defaultValue="monitor" className="space-y-6">
            <TabsList className="bg-card border border-border">
              <TabsTrigger value="monitor" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Shield className="h-4 w-4 mr-2" />
                Admin Monitor
              </TabsTrigger>
              <TabsTrigger value="capture" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Monitor className="h-4 w-4 mr-2" />
                Competitor View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="monitor" className="animate-fade-in">
              <AdminDashboard />
            </TabsContent>

            <TabsContent value="capture" className="animate-fade-in">
              <div className="max-w-lg mx-auto">
                <CompetitorCapture />
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

  // Regular user view (competitor)
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Competition Monitor
            </h1>
            <p className="text-muted-foreground">
              Start screen capture to participate in the monitored competition
            </p>
          </div>

          <CompetitorCapture />
        </div>
      </main>
    </div>
  );
};

export default Index;
