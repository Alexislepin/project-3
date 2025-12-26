import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Settings } from 'lucide-react';
import { debugLog, fatalError } from '../utils/logger';
import { requestCameraPermission, openSettings as openCameraSettings } from '../lib/cameraPermission';
import { AppHeader } from './AppHeader';

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
    startScanner();

    return () => {
      stopScanner();
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
          qrbox: { width: 250, height: 150 }
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
    <div
      className="fixed inset-0 bg-black/90 z-50 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopScanner();
          onClose();
        }
      }}
    >
      <div className="bg-black/50">
        <AppHeader
          title="Scanner le code-barres"
          showClose
          onClose={() => {
            stopScanner();
            onClose();
          }}
          className="bg-black/50 border-b border-white/10 text-white"
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div id="barcode-reader" className="w-full max-w-md rounded-lg overflow-hidden"></div>

        {error && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-white text-center max-w-md">
            <p className="mb-3">{error}</p>
            {showSettingsPrompt && (
              <button
                onClick={handleOpenSettings}
                className="w-full bg-white text-red-600 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Ouvrir Réglages
              </button>
            )}
          </div>
        )}

        {scanning && !error && (
          <div className="mt-4 text-white text-center">
            <p className="text-lg font-semibold mb-2">Placez le code-barres dans le cadre</p>
            <p className="text-sm text-gray-300">Le livre sera ajouté automatiquement</p>
          </div>
        )}
      </div>
    </div>
  );
}
