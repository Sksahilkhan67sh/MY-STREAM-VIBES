'use client';
/**
 * GradedPreview
 * Renders a <canvas> that continuously draws from a source <video>
 * with CSS filter applied. Exposes a captureStream() so the graded
 * output can be published to LiveKit instead of the raw MediaStream.
 */
import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { buildFilter, buildVignette, ColorSettings } from './ColorGrading';

export interface GradedPreviewHandle {
  /** Returns a MediaStream of the canvas output — publish this to LiveKit */
  getCaptureStream: () => MediaStream | null;
}

interface GradedPreviewProps {
  sourceVideoRef: React.RefObject<HTMLVideoElement>; // hidden raw video
  settings:       ColorSettings;
  active:         boolean;
  className?:     string;
}

const GradedPreview = forwardRef<GradedPreviewHandle, GradedPreviewProps>(
  ({ sourceVideoRef, settings, active, className = '' }, ref) => {
    const canvasRef      = useRef<HTMLCanvasElement>(null);
    const rafRef         = useRef<number>(0);
    const captureRef     = useRef<MediaStream | null>(null);

    // Expose getCaptureStream to parent
    useImperativeHandle(ref, () => ({
      getCaptureStream: () => captureRef.current,
    }));

    useEffect(() => {
      if (!active) { cancelAnimationFrame(rafRef.current); return; }

      const canvas = canvasRef.current;
      const src    = sourceVideoRef.current;
      if (!canvas || !src) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Start capturing at 30fps
      if (!captureRef.current) {
        captureRef.current = (canvas as any).captureStream(30) as MediaStream;
      }

      const draw = () => {
        if (src.readyState >= 2 && src.videoWidth > 0) {
          // Match canvas to video dimensions
          if (canvas.width !== src.videoWidth)  canvas.width  = src.videoWidth;
          if (canvas.height !== src.videoHeight) canvas.height = src.videoHeight;

          // Apply CSS filter via canvas filter API
          ctx.filter = buildFilter(settings);
          ctx.drawImage(src, 0, 0, canvas.width, canvas.height);

          // Vignette overlay drawn on top
          if (settings.vignette > 0) {
            const alpha = settings.vignette / 100 * 0.75;
            const grad = ctx.createRadialGradient(
              canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
              canvas.width / 2, canvas.height / 2, canvas.width * 0.8
            );
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${alpha.toFixed(3)})`);
            ctx.filter = 'none';
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
        rafRef.current = requestAnimationFrame(draw);
      };

      rafRef.current = requestAnimationFrame(draw);
      return () => { cancelAnimationFrame(rafRef.current); };
    }, [active, settings, sourceVideoRef]);

    // Reset capture stream when deactivated
    useEffect(() => {
      if (!active) { captureRef.current = null; }
    }, [active]);

    if (!active) return null;

    return (
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain ${className}`}
        style={{ display: active ? 'block' : 'none' }}
      />
    );
  }
);

GradedPreview.displayName = 'GradedPreview';
export default GradedPreview;
