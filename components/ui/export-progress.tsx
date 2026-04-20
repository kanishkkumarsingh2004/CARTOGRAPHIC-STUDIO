'use client';

import React from 'react';

interface ExportProgressProps {
  isVisible: boolean;
  progress: number;
  status: string;
}

export const ExportProgress: React.FC<ExportProgressProps> = ({ 
  isVisible, 
  progress, 
  status 
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-12 bg-black/60 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="w-full max-w-[320px] space-y-8 animate-in zoom-in-95 slide-in-from-bottom-8 duration-700 delay-100 fill-mode-both">
        <div className="space-y-3 text-center text-white">
          <p className="text-[10px] font-black tracking-[0.4em] uppercase opacity-40">Exporting Your Artwork</p>
          <p className="text-sm font-bold tracking-[0.2em] uppercase text-primary drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]">
            {status || 'Preparing...'}
          </p>
        </div>
        
        <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]">
          <div 
            className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.8)] transition-all ease-linear"
            style={{ 
              width: `${progress}%`,
              transitionDuration: progress >= 100 ? '400ms' : progress >= 95 ? '10000ms' : '1000ms'
            }}
          />
        </div>
        
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest whitespace-nowrap">High Fidelity Renderer</span>
          </div>
          <span className="text-xs font-mono text-primary font-bold tabular-nums">{progress}%</span>
        </div>

        {/* Glossy highlight for the container */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      </div>

      <style jsx>{`
        .bg-primary {
          background-color: var(--primary);
        }
        .text-primary {
          color: var(--primary);
        }
      `}</style>
    </div>
  );
};
