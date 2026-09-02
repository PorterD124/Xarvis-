import React, { useEffect } from 'react';

interface GoogleAdProps {
  slot: string;
  format?: 'auto' | 'fluid' | 'rectangle';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A standard Google AdSense component.
 * Note: To use this, you must set VITE_GOOGLE_ADSENSE_ID in your environment.
 */
export const GoogleAd: React.FC<GoogleAdProps> = ({ 
  slot, 
  format = 'auto', 
  className = "", 
  style = { display: 'block' } 
}) => {
  const adRef = React.useRef<HTMLModElement>(null);
  const initializedRef = React.useRef(false);

  useEffect(() => {
    const adElement = adRef.current;
    if (!adElement) return;

    const initializeAd = () => {
      if (initializedRef.current) return;
      
      if (adElement.offsetWidth > 0) {
        try {
          (window as any).adsbygoogle = (window as any).adsbygoogle || [];
          (window as any).adsbygoogle.push({});
          initializedRef.current = true;
          console.log(`[DEBUG] Google AdSense initialized for slot: ${slot}`);
        } catch (e: any) {
          if (!e.message?.includes("already have ads")) {
            console.error("[DEBUG] Google AdSense error:", e);
          }
        }
      }
    };

    // Use IntersectionObserver to detect when the ad becomes visible/has dimensions
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.boundingClientRect.width > 0) {
          initializeAd();
          observer.disconnect();
        }
      });
    }, { threshold: 0.1 });

    observer.observe(adElement);

    // Fallback: try after a delay in case IntersectionObserver doesn't fire as expected
    const timer = setTimeout(initializeAd, 2000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [slot]);

  const publisherId = import.meta.env.VITE_GOOGLE_ADSENSE_ID || "ca-pub-4014126324266078";

  return (
    <div className={`ad-wrapper overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] ${className}`}>
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/5 bg-white/[0.01]">
        <span className="text-[8px] font-mono uppercase tracking-widest text-white/20">Advertisement</span>
        <span className="text-[8px] font-mono text-white/10 uppercase">Sponsored</span>
      </div>
      <div className="p-2 min-h-[100px] flex items-center justify-center relative">
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={style}
          data-ad-client={publisherId}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
        {/* Placeholder text for development if script fails to load or account is not approved */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
          <span className="text-[10px] font-mono uppercase tracking-[0.5em] text-white">Ad Placement</span>
        </div>
      </div>
    </div>
  );
};
