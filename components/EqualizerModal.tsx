
import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { DEFAULT_EQ_PRESETS } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  aiAutoEq: boolean;
  onToggleAiAutoEq: () => void;
}

export const EqualizerModal: React.FC<Props> = ({ isOpen, onClose, aiAutoEq, onToggleAiAutoEq }) => {
  if (!isOpen) return null;

  const bands = [60, 200, 500, 1000, 4000, 10000];
  const labels = ['60Hz', '200Hz', '500Hz', '1kHz', '4kHz', '10kHz'];

  const handleSliderChange = (index: number, val: number) => {
    // If user touches manual slider, we should probably disable AI mode or just override it temporarily
    if (aiAutoEq) onToggleAiAutoEq();
    audioEngine.setEQBand(index, val);
  };

  const applyPreset = (presetName: keyof typeof DEFAULT_EQ_PRESETS) => {
    if (aiAutoEq) onToggleAiAutoEq(); // Disable AI if manual preset used
    const values = DEFAULT_EQ_PRESETS[presetName];
    values.forEach((val, idx) => {
       audioEngine.setEQBand(idx, val);
       const slider = document.getElementById(`eq-slider-${idx}`) as HTMLInputElement;
       if(slider) slider.value = val.toString();
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#181818] p-6 rounded-2xl w-[90%] max-w-lg border border-gray-700 shadow-2xl relative overflow-hidden">
        
        {/* Background glow for AI mode */}
        {aiAutoEq && <div className="absolute inset-0 bg-[#d946ef]/10 pointer-events-none animate-pulse" />}

        <div className="flex justify-between items-center mb-6 relative z-10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Equalizer 
              {aiAutoEq && <span className="text-[10px] bg-[#d946ef] text-white px-2 py-0.5 rounded-full animate-bounce">AI AUTO-TUNED</span>}
          </h2>
          <button onClick={onClose}><X className="text-gray-400 hover:text-white" /></button>
        </div>

        {/* AI Toggle */}
        <div className="mb-6 flex justify-center relative z-10">
            <button 
                onClick={onToggleAiAutoEq}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${aiAutoEq ? 'bg-gradient-to-r from-[#d946ef] to-[#22d3ee] text-white shadow-[0_0_15px_rgba(217,70,239,0.5)] scale-[1.02]' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
            >
                <Sparkles size={18} className={aiAutoEq ? "animate-spin-slow" : ""} />
                {aiAutoEq ? "AI Auto-Tuning Active" : "Enable AI Auto-Tune"}
            </button>
        </div>

        {/* Presets */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 relative z-10 scrollbar-hide">
           {Object.keys(DEFAULT_EQ_PRESETS).map((key) => (
             <button
               key={key}
               onClick={() => applyPreset(key as any)}
               className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors uppercase whitespace-nowrap ${aiAutoEq ? 'opacity-50 cursor-not-allowed bg-gray-800 text-gray-500' : 'bg-gray-800 hover:bg-[#22d3ee] hover:text-black text-gray-300'}`}
               disabled={aiAutoEq}
             >
               {key}
             </button>
           ))}
        </div>

        {/* Sliders */}
        <div className="flex justify-between items-end h-48 space-x-2 relative z-10">
          {bands.map((band, idx) => (
            <div key={band} className="flex flex-col items-center h-full w-full">
              <input
                id={`eq-slider-${idx}`}
                type="range"
                min="-12"
                max="12"
                defaultValue="0"
                onChange={(e) => handleSliderChange(idx, parseFloat(e.target.value))}
                className={`h-full w-2 rounded-lg appearance-none cursor-pointer vertical-slider transition-colors ${aiAutoEq ? 'bg-[#d946ef]' : 'bg-gray-600 hover:bg-[#22d3ee]'}`}
                style={{ WebkitAppearance: 'slider-vertical' } as any}
              />
              <span className={`text-xs mt-3 font-mono ${aiAutoEq ? 'text-[#d946ef]' : 'text-gray-400'}`}>{labels[idx]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
