import { useEffect, useState, useCallback, useRef } from 'react';

interface DevToolsDetectionOptions {
  onDetected?: () => void;
}

export const useDevToolsDetection = (options?: DevToolsDetectionOptions) => {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(false);
  const hasNotifiedRef = useRef(false);

  const handleDetection = useCallback(() => {
    setIsDevToolsOpen(true);
    setHasBeenOpened(true);
    
    // Only call onDetected once per session
    if (!hasNotifiedRef.current && options?.onDetected) {
      hasNotifiedRef.current = true;
      options.onDetected();
    }
  }, [options]);

  const checkDevTools = useCallback(() => {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    const isOpen = widthThreshold || heightThreshold;
    
    if (isOpen && !isDevToolsOpen) {
      handleDetection();
    } else if (!isOpen && isDevToolsOpen) {
      setIsDevToolsOpen(false);
    }
  }, [isDevToolsOpen, handleDetection]);

  useEffect(() => {
    // Check on mount
    checkDevTools();

    // Check on resize (devtools opening/closing triggers resize)
    window.addEventListener('resize', checkDevTools);

    // Also use debugger timing detection as backup
    const interval = setInterval(() => {
      const start = performance.now();
      const element = new Image();
      Object.defineProperty(element, 'id', {
        get: function() {
          handleDetection();
        }
      });
      
      // Console.log with %c triggers the getter when devtools is open
      console.log('%c', element);
      console.clear();
      
      const end = performance.now();
      if (end - start > 100) {
        handleDetection();
      }
    }, 1000);

    return () => {
      window.removeEventListener('resize', checkDevTools);
      clearInterval(interval);
    };
  }, [checkDevTools, handleDetection]);

  return { isDevToolsOpen, hasBeenOpened };
};
