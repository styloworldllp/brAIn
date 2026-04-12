"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { uploadFile, Dataset } from "@/lib/api";

interface Props {
  onClose: () => void;
  onSuccess: (dataset: Dataset) => void;
}

export default function UploadModal({ onClose, onSuccess }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const file = files[0];
      setUploading(true);
      setError("");
      try {
        const dataset = await uploadFile(file);
        onSuccess(dataset);
        onClose();
      } catch (e: unknown) {
        setError(typeof e === "string" ? e : "Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [onClose, onSuccess]
  );

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <Backdrop onClose={onClose}>
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#e8eaf0]">Upload CSV or Excel</h2>
          <button onClick={onClose} className="text-[#8b90a8] hover:text-[#e8eaf0]"><X size={18} /></button>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
            ${isDragActive ? "border-[#6c63ff] bg-[#6c63ff]/5" : "border-[#2e3347] hover:border-[#6c63ff]/50"}
            ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-[#6c63ff]" size={28} />
              <p className="text-sm text-[#8b90a8]">Processing {acceptedFiles[0]?.name}…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#6c63ff]/10 flex items-center justify-center">
                <Upload size={22} className="text-[#6c63ff]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#e8eaf0]">
                  {isDragActive ? "Drop the file here" : "Drag & drop your file"}
                </p>
                <p className="text-xs text-[#8b90a8] mt-1">or click to browse — CSV, XLSX, XLS</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <p className="mt-4 text-xs text-[#8b90a8]">
          Files are stored locally. Maximum 100,000 rows.
        </p>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  );
}
