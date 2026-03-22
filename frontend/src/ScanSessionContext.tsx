import React, { createContext, useContext, useState } from 'react';

interface ScanResultState {
  resultData: any | null;
  imageBase64: string | null;
}

interface ScanSessionContextValue extends ScanResultState {
  setScanResult: (data: ScanResultState) => void;
  clearScanResult: () => void;
}

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);

export function ScanSessionProvider({ children }: { children: React.ReactNode }) {
  const [resultData, setResultData] = useState<any | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  const setScanResult = (data: ScanResultState) => {
    setResultData(data.resultData);
    setImageBase64(data.imageBase64);
  };

  const clearScanResult = () => {
    setResultData(null);
    setImageBase64(null);
  };

  return (
    <ScanSessionContext.Provider value={{ resultData, imageBase64, setScanResult, clearScanResult }}>
      {children}
    </ScanSessionContext.Provider>
  );
}

export function useScanSession() {
  const context = useContext(ScanSessionContext);
  if (!context) {
    throw new Error('useScanSession must be used within a ScanSessionProvider');
  }
  return context;
}
