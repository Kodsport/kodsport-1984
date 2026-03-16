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
  const {
    user,
    isAdmin,
    loading
  } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>;
  }

  if (!user) {
    return <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md animate-fade-in">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-6">
                <Logo />
              </div>
              <h1 className="font-bold mb-2 text-destructive bg-inherit text-3xl">DON'T you dare cheat</h1>
              <p className="text-muted-foreground text-sm">Competition Monitoring</p>
            </div>

            <Card className="glass-panel card-elevated">
              <CardContent className="pt-6">
                <AuthForm />
              </CardContent>
            </Card>

            <div className="mt-6 p-4 rounded-lg border border-border bg-card/50 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">Privacy Policy</p>
              <p>
                All screen recordings and personal data collected during this competition are accessible only to Kodsport Sverige. No data is shared with any third parties.
              </p>
              <p>
                All collected data, including recordings, screenshots, and account information, will be permanently deleted after the competition has concluded.
              </p>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Programmeringsolympiaden — Kodsport Sverige
            </p>
          </div>
        </div>
      </div>;
  }

  if (isAdmin) {
    return <div className="min-h-screen bg-background">
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
                Participant View
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
      </div>;
  }

  return <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Programmeringsolympiaden Monitor
            </h1>
            <p className="text-muted-foreground">
              Start screen recording to participate in the monitored competition
            </p>
          </div>

          <CompetitorCapture />
        </div>
      </main>
    </div>;
};
export default Index;
