"use client";

import React, { useState, useEffect } from "react";
import { Camera, X, Scan, CheckCircle, Volume2, Sparkles } from "lucide-react";
import { ProductDTO } from "@/lib/types";

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductDTO[];
  onScanMatch: (product: ProductDTO) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onScanMatch,
}) => {
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [matchStatus, setMatchStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  };

  const handleManualBarcodeInput = (code: string) => {
    setScannedBarcode(code);
    const found = products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
    );

    if (found) {
      playBeep();
      setMatchStatus(`Found: ${found.name}`);
      setTimeout(() => {
        onScanMatch(found);
        setMatchStatus(null);
        setScannedBarcode("");
        onClose();
      }, 600);
    } else {
      setMatchStatus("No product matching this barcode");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Camera className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-sm">Camera Barcode Scanner</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder simulation */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-full h-48 bg-slate-950 rounded-xl overflow-hidden border-2 border-slate-800 flex items-center justify-center group">
            {/* Scan animation line */}
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-[bounce_2s_infinite]" />

            <div className="flex flex-col items-center gap-2 text-slate-500 text-center px-4">
              <Scan className="w-12 h-12 text-emerald-400 animate-pulse" />
              <p className="text-xs text-slate-400">
                Point camera at product barcode or tap preset below
              </p>
            </div>
          </div>

          {matchStatus && (
            <div
              className={`mt-3 w-full p-2.5 rounded-lg text-xs font-medium text-center flex items-center justify-center gap-2 ${
                matchStatus.startsWith("Found")
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}
            >
              {matchStatus.startsWith("Found") && <CheckCircle className="w-4 h-4" />}
              <span>{matchStatus}</span>
            </div>
          )}

          {/* Manual / Preset Barcodes */}
          <div className="w-full mt-4">
            <p className="text-xs text-slate-400 font-medium mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Simulate Barcode Scan Preset:</span>
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleManualBarcodeInput(p.barcode || p.sku)}
                  className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-left border border-slate-700/60 transition text-xs"
                >
                  <p className="font-semibold text-slate-200 truncate">{p.name}</p>
                  <p className="text-[10px] text-emerald-400 font-mono">
                    [{p.barcode || p.sku}]
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
