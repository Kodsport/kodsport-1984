import { Code2 } from 'lucide-react';

export const Logo = () => {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
        <Code2 className="h-5 w-5 text-primary-foreground" />
      </div>
      <div className="flex flex-col">
        <span className="text-lg font-bold tracking-tight text-foreground">
          Programmerings
        </span>
        <span className="text-sm font-semibold text-primary -mt-1">
          olympiaden
        </span>
      </div>
    </div>
  );
};
