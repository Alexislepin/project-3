import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Settings, X } from 'lucide-react';
import { debugLog, fatalError } from '../utils/logger';
import { requestCameraPermission, openSettings as openCameraSettings } from '../lib/cameraPermission';

interface BarcodeScannerProps {
  onScan: (isbn: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);
  const hasDetectedRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const lastScannedIsbnRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    // Block body scroll when scanner is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    startScanner();

    return () => {
      stopScanner();
      // Restore body scroll
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const startScanner = async () => {
    // Prevent multiple start calls
    if (isStartingRef.current || scannerRef.current) {
      return;
    }

    isStartingRef.current = true;

    try {
      // Request camera permission first
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        setError('Autorisation caméra requise');
        setShowSettingsPrompt(true);
        setScanning(false);
        isStartingRef.current = false;
        return;
      }

      setScanning(true);
      setError('');
      setShowSettingsPrompt(false);
      hasDetectedRef.current = false;
      lastScannedIsbnRef.current = null;

      const scanner = new Html5Qrcode('barcode-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 } // Default box, actual frame is styled via CSS
        },
        (decodedText) => {
          // VERY FIRST CHECK: return immediately if already detected
          if (hasDetectedRef.current) {
            return;
          }

          // Only process valid ISBN-13 (length === 13)
          const cleanIsbn = decodedText.replace(/[-\s]/g, '');
          if (cleanIsbn.length !== 13) {
            return;
          }

          // Throttle: ignore if same ISBN scanned within 1500ms
          const now = Date.now();
          if (lastScannedIsbnRef.current === cleanIsbn && (now - lastScanTimeRef.current) < 1500) {
            return;
          }

          // Mark as detected immediately - no more frames will be processed
          hasDetectedRef.current = true;
          lastScannedIsbnRef.current = cleanIsbn;
          lastScanTimeRef.current = now;

          // Log successful scan (dev only)
          debugLog('ISBN scanned:', cleanIsbn);

          // Call onScan immediately
          onScan(cleanIsbn);

          // Stop scanner and close modal immediately
          stopScanner();
          onClose();
        },
        (error: any) => {
          // Silently ignore normal scanner behavior (no barcode in frame)
          const errorMessage = error?.message || error?.toString() || '';
          const errorName = error?.name || '';
          
          if (
            errorName === 'NotFoundException' ||
            errorMessage.includes('NotFoundException') ||
            errorMessage.includes('No barcode') ||
            errorMessage.includes('No MultiFormat Readers') ||
            errorMessage.includes('were able to detect') ||
            (typeof error === 'string' && (
              error.includes('No barcode') || 
              error.includes('NotFoundException') ||
              error.includes('No MultiFormat Readers')
            ))
          ) {
            // Normal scanner behavior - no code detected on this frame
            // Don't log anything, just ignore silently
            return;
          }

          // Only log fatal unexpected errors (permission denied, camera errors, etc.)
          fatalError('Fatal scanner error:', error);
        }
      );

      isStartingRef.current = false;
    } catch (err: any) {
      isStartingRef.current = false;
      
      // Check if it's a permission error
      if (err?.message?.includes('permission') || err?.message?.includes('Permission')) {
        setError('Autorisation caméra requise');
        setShowSettingsPrompt(true);
      } else {
        fatalError('Fatal error starting scanner:', err);
        setError('Impossible d\'accéder à la caméra. Veuillez vérifier les autorisations.');
      }
      setScanning(false);
    }
  };

  const handleOpenSettings = async () => {
    await openCameraSettings();
  };

  const stopScanner = async () => {
    // Only stop if scanner exists and is actually running
    if (!scannerRef.current) {
      return;
    }

    const scanner = scannerRef.current;
    
    // Check if scanner is running before attempting to stop
    if (!scanner.isScanning) {
      scannerRef.current = null;
      setScanning(false);
      return;
    }

    try {
      await scanner.stop();
      scanner.clear();
      scannerRef.current = null;
      setScanning(false);
    } catch (err: any) {
      // Silently ignore stopping errors (common if already stopped)
      scannerRef.current = null;
      setScanning(false);
    }
  };

  return (
    <>
      {/* Global style for Html5Qrcode video to fill screen */}
      <style>{`
        #barcode-reader video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      `}</style>

      <div className="fixed inset-0 z-[9999] bg-black">
        {/* Camera preview - fullscreen background */}
        <div className="absolute inset-0 z-0">
          <div id="barcode-reader" className="w-full h-full" />
          {/* Dark premium overlay */}
          <div className="absolute inset-0 bg-black/55" />
          {/* Vignette */}
          <div className="absolute inset-0 [background:radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.75)_70%,rgba(0,0,0,0.9)_100%)]" />
        </div>

        {/* Header */}
        <div
          className="fixed left-0 right-0 z-20 px-4 flex items-center gap-3"
          style={{ top: 'env(safe-area-inset-top)', paddingTop: 10, paddingBottom: 10 }}
        >
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2 -ml-2 rounded-lg active:scale-95 transition"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-[15px] font-semibold text-white">
            Scanner un code-barres
          </h1>
        </div>

        {/* Center frame - vertical */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="relative rounded-[28px] border border-white/90 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            style={{
              width: 'min(78vw, 340px)',
              height: 'calc(min(78vw, 340px) * 1.35)',
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(2px)',
            }}
          >
            {/* inner highlight */}
            <div className="absolute inset-0 rounded-[28px] ring-1 ring-white/15" />
            {/* scan line */}
            <div className="absolute left-6 right-6 top-1/2 h-px bg-white/50" />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 p-6 bg-red-600/95 border border-red-500 rounded-2xl text-white text-center max-w-sm backdrop-blur-md">
            <p className="mb-4 text-base font-medium">{error}</p>
            {showSettingsPrompt && (
              <button
                onClick={handleOpenSettings}
                className="w-full bg-white text-red-600 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
              >
                <Settings className="w-5 h-5" />
                Ouvrir Réglages
              </button>
            )}
          </div>
        )}

        {/* Footer instruction */}
        {scanning && !error && (
          <div
            className="fixed left-0 right-0 z-20 px-6 text-center"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}
          >
            <p className="text-white text-[15px] font-semibold">
              Placez le code-barres dans le cadre
            </p>
            <p className="text-white/70 text-[12px] mt-1">
              Le livre sera détecté automatiquement
            </p>
          </div>
        )}
      </div>
    </>
  );
}
