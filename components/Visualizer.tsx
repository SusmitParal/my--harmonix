
import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

export const Visualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let isRunning = true;
    
    const analyser = audioEngine.getAnalyser();

    // Responsive canvas
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const render = () => {
      if (!isRunning) return;

      if (!analyser) {
        // If analyser isn't ready, verify less frequently to save CPU
        setTimeout(() => {
            if(isRunning) animationId = requestAnimationFrame(render);
        }, 500);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Verify if audio is actually playing/sending data to save draw calls on silence
      // Sum a few bins to check activity
      let sum = 0;
      for(let i=0; i<10; i++) sum += dataArray[i];
      
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Only draw if there is sound data or clearscreen
      if (sum > 0) {
          // Wider bars for neon look
          const barWidth = (canvas.width / bufferLength) * 2.5;
          let barHeight;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] * 1.8; // Scale up

            // Neon Gradient: Fuchsia to Cyan
            const fillStyle = i % 2 === 0 
                ? `rgba(217, 70, 239, ${dataArray[i]/255})` // Neon Fuchsia
                : `rgba(34, 211, 238, ${dataArray[i]/255})`; // Neon Cyan

            ctx.fillStyle = fillStyle;
            
            // Glow effect optimization: only apply shadow if bar is tall enough
            if (barHeight > 50) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = fillStyle;
            } else {
                ctx.shadowBlur = 0;
            }
            
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
          }
          // Reset shadow for next frame
          ctx.shadowBlur = 0;
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="visualizer-canvas" />;
};
