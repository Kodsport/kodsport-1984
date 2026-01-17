import { useEffect, useState, useCallback } from 'react';

export const useDevToolsDetection = () => {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);

  const checkDevTools = useCallback(() => {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    const isOpen = widthThreshold || heightThreshold;
    
    if (isOpen && !isDevToolsOpen) {
      setIsDevToolsOpen(true);
      setHasBeenOpened(true);
    } else if (!isOpen && isDevToolsOpen) {
      setIsDevToolsOpen(false);
    }
  }, [isDevToolsOpen]);

  useEffect(() => {
    // Check on mount
    checkDevTools();

    // Check on resize (devtools opening/closing triggers resize)
    window.addEventListener('resize', checkDevTools);

    // Also use debugger timing detection as backup
    const interval = setInterval(() => {
      const start = performance.now();
      // This triggers when devtools is open because debugger statement pauses execution
      // We use a regex-based check that gets slower when devtools console is open
      const element = new Image();
      Object.defineProperty(element, 'id', {
        get: function() {
          setIsDevToolsOpen(true);
          setHasBeenOpened(true);
        }
      });
      
      // Console.log with %c triggers the getter when devtools is open
      console.log('%c', element);
      console.clear();
      
      const end = performance.now();
      // If the check took too long, devtools might be open with breakpoints
      if (end - start > 100) {
        setIsDevToolsOpen(true);
        setHasBeenOpened(true);
      }
    }, 1000);

    return () => {
      window.removeEventListener('resize', checkDevTools);
      clearInterval(interval);
    };
  }, [checkDevTools]);

  return { isDevToolsOpen, hasBeenOpened };
};
