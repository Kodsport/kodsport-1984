import { Shield, Code } from 'lucide-react';

export const Logo = () => {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Shield className="h-8 w-8 text-primary" />
        <Code className="h-4 w-4 text-primary-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="flex flex-col">
        <span className="text-lg font-bold tracking-tight text-foreground">
          PROGRAMMERINGS
        </span>
        <span className="text-sm font-semibold text-primary -mt-1">
          OLYMPIADEN
        </span>
      </div>
    </div>
  );
};
