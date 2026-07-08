"use client";
import { useState } from "react";
import { X, Download } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface DwgViewerProps {
  fileUrl: string;
  fileName: string;
  onClose: () => void;
}

export default function DwgViewer({ fileUrl, fileName, onClose }: DwgViewerProps) {
  useBodyScrollLock(true);
  const [loading, setLoading] = useState(true);
  const viewerUrl = `/dwg-viewer.html?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName)}`;

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-700">
        <span className="text-white text-sm font-medium truncate">{fileName}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const res = await fetch(fileUrl);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fileName || "dosya";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="İndir"
          >
            <Download size={20} />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      {/* Viewer iframe */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent" />
          </div>
        )}
        <iframe
          src={viewerUrl}
          className="w-full h-full border-0"
          onLoad={() => setLoading(false)}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
