
import React from 'react';

interface ScreenPreviewProps {
  imageDataUrl: string | null;
}

export const ScreenPreview: React.FC<ScreenPreviewProps> = ({ imageDataUrl }) => {
  if (!imageDataUrl) {
    return (
      <div className="p-4 text-center text-slate-500 bg-slate-850 rounded-md min-h-[120px] sm:min-h-[150px] flex items-center justify-center">
        Preview will appear here.
      </div>
    );
  }

  return (
    <div className="p-1 bg-slate-700/60 rounded-lg shadow-lg">
      <div className="bg-slate-900/80 p-1 sm:p-1.5 rounded-md">
        <img 
          src={imageDataUrl} 
          alt="Latest capture preview" 
          className="max-w-full max-h-[16rem] sm:max-h-[18rem] lg:max-h-[22rem] object-contain rounded-sm mx-auto border-2 border-slate-600"
        />
      </div>
    </div>
  );
};
