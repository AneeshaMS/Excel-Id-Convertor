import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { WorkerResponse } from "./types";
import { downloadCsv } from "./utils/downloadCsv";

type Result = {
  csv: string;
  recordCount: number;
  elapsedMs: number;
  fileName: string;
  generatedAt: string;
};

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingFileRef = useRef<File | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("./workers/file.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      setIsProcessing(false);

      if (event.data.type === "error") {
        setError(event.data.message);
        setResult(null);
        pendingFileRef.current = null;
        return;
      }

      const completedFile = pendingFileRef.current;
      setError("");
      setResult({
        csv: event.data.csv,
        recordCount: event.data.recordCount,
        elapsedMs: event.data.elapsedMs,
        fileName: completedFile?.name ?? "converted_file",
        generatedAt: event.data.generatedAt,
      });
      pendingFileRef.current = null;
    };

    worker.onerror = () => {
      setIsProcessing(false);
      setError("An unexpected processing error occurred. Please try another file.");
      setResult(null);
      pendingFileRef.current = null;
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const selectFile = (selectedFile?: File) => {
    if (!selectedFile || isProcessing) return;
    setError("");
    setResult(null);
    setFile(selectedFile);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!isProcessing) selectFile(event.dataTransfer.files[0]);
  };

  const convertFile = async () => {
    if (!file || !workerRef.current || isProcessing) return;

    setIsProcessing(true);
    setError("");
    setResult(null);
    pendingFileRef.current = file;

    try {
      const buffer = await file.arrayBuffer();
      workerRef.current.postMessage({ buffer, fileName: file.name }, [buffer]);
    } catch {
      setIsProcessing(false);
      pendingFileRef.current = null;
      setError("The selected file could not be read.");
    }
  };

  const handleDownload = () => {
    if (result) downloadCsv(result.csv, result.fileName);
  };

  const reset = () => {
    if (isProcessing) return;
    setFile(null);
    setResult(null);
    setError("");
    pendingFileRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="File ID Converter home">
          <span className="brand-mark">ID</span>
          <span>File ID Converter</span>
        </a>
      </header>

      <section className="content">
        <div className="eyebrow">FILE CONVERSION UTILITY</div>
        <h1>Update IDs. Export CSV.</h1>
        <p className="intro">
          Upload a supported file and automatically generate unique timestamp-based
          IDs for every data row in Column A.
        </p>

        <section
          className={`upload-card ${isDragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isProcessing) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          aria-label="File upload area"
        >
          <div className="upload-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5v-4" />
            </svg>
          </div>
          <h2>Choose a file</h2>
          <p className="drop-copy">Drag and drop your file here, or browse files</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
          >
            Browse files
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="*/*"
            onChange={handleInputChange}
            disabled={isProcessing}
          />
          <p className="file-types">
            Supported formats are determined by the file processor.
          </p>
        </section>

        {file && (
          <section className="file-card" aria-live="polite">
            <div className="file-icon">
              {file.name.split(".").pop()?.toUpperCase() ?? "FILE"}
            </div>
            <div className="file-info">
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={reset}
              disabled={isProcessing}
              aria-label="Remove selected file"
              title="Remove file"
            >
              ×
            </button>
          </section>
        )}

        {file && !result && (
          <button
            className="button button-primary convert-button"
            type="button"
            onClick={convertFile}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <span className="spinner" />
                Processing file...
              </>
            ) : "Convert to CSV"}
          </button>
        )}

        {isProcessing && (
          <p className="processing-note" role="status">
            Processing locally in a background worker. Large files may take longer.
          </p>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            <strong>Unable to convert file</strong>
            <span>{error}</span>
          </div>
        )}

        {result && (
          <section className="result-card" aria-live="polite">
            <div className="success-heading">
              <span className="success-check">✓</span>
              <div>
                <h2>Conversion complete</h2>
                <p>Your CSV file is ready to download.</p>
              </div>
            </div>
            <div className="stats">
              <div>
                <span className="stat-value">{result.recordCount.toLocaleString()}</span>
                <span className="stat-label">IDs updated</span>
              </div>
              <div>
                <span className="stat-value">{result.elapsedMs.toLocaleString()} ms</span>
                <span className="stat-label">Worker processing time</span>
              </div>
            </div>
            <button className="button button-primary download-button" onClick={handleDownload}>
              Download CSV <span aria-hidden="true">↓</span>
            </button>
            <button className="text-button" onClick={reset}>Convert another file</button>
          </section>
        )}

        <section className="rules-card">
          <h3>How it works</h3>
          <ul>
            <li><span>01</span> The worker detects the extension and selects the parser.</li>
            <li><span>02</span> The first row is retained as the header.</li>
            <li><span>03</span> Every non-empty data row receives a unique ID in Column A.</li>
            <li><span>04</span> All columns are exported as CSV.</li>
          </ul>
          <div className="id-example">
            <span>Generated ID format</span>
            <code>prefix + timestamp + sequence</code>
          </div>
        </section>

        <p className="privacy-footnote">
          Your files are processed locally in this browser. They are not sent to a
          backend or uploaded to Netlify.
        </p>
      </section>
      <footer>File ID Converter · Client-side file processing</footer>
    </main>
  );
}

export default App;
