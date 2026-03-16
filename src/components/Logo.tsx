import logoImg from '@/assets/logo.png';

export const Logo = () => {
  return (
    <div className="flex items-center gap-3">
      <img src={logoImg} alt="Programmeringsolympiaden" className="h-9 w-9" />
      <span className="text-lg font-bold tracking-tight text-foreground">
        Programmeringsolympiaden
      </span>
    </div>
  );
};
