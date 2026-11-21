/// <reference lib="webworker" />

import * as XLSX from "xlsx";
import type { WorkerRequest, WorkerResponse } from "../types";

const workerScope = self as DedicatedWorkerGlobalScope;
const ID_PREFIX_LENGTH = 6;
const SEQUENCE_WIDTH = 6;
const DAT_DELIMITER = "|";

type CellValue = string | number | boolean;
type FileRow = CellValue[];
type FileParser = (buffer: ArrayBuffer) => FileRow[];

function parseDatFile(buffer: ArrayBuffer): FileRow[] {
  const content = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const rows: FileRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === DAT_DELIMITER && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && content[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (inQuotes) throw new Error("The DAT file contains an unclosed quoted field.");

  return rows;
}

function parseExcelFile(buffer: ArrayBuffer): FileRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) throw new Error("The Excel workbook has no worksheets.");

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet || !worksheet["!ref"]) {
    throw new Error("The first Excel worksheet is empty.");
  }

  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as FileRow[];
}

// Add future file parsers here, keyed by lowercase extension.
const fileParsers: Record<string, FileParser> = {
  xlsx: parseExcelFile,
  xls: parseExcelFile,
  dat: parseDatFile,
};

function updateIds(rows: FileRow[], timestamp: number): number {
  if (rows.length < 2) {
    throw new Error("The file must contain a header and at least one data row.");
  }

  let recordCount = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowHasData = row.some((value) => String(value ?? "").trim() !== "");
    if (!rowHasData) continue;

    const originalId = String(row[0] ?? "").trim();
    if (!originalId) {
      throw new Error(`Missing ID in Column A at row ${rowIndex + 1}.`);
    }

    if (originalId.length < ID_PREFIX_LENGTH) {
      throw new Error(`Invalid ID in Column A at row ${rowIndex + 1}. Expected at least ${ID_PREFIX_LENGTH} characters.`);
    }

    const prefix = originalId.slice(0, ID_PREFIX_LENGTH);
    recordCount += 1;
    const sequence = String(recordCount).padStart(SEQUENCE_WIDTH, "0");
    row[0] = `${prefix}${timestamp}${sequence}`;
  }

  if (recordCount === 0) throw new Error("No non-empty data records were found.");
  return recordCount;
}

function generateCsv(rows: FileRow[]): string {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(worksheet, { FS: ",", RS: "\r\n" });
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const startedAt = performance.now();

  try {
    const { buffer, fileName } = event.data;
    const extension = fileName.split(".").pop()?.toLowerCase();

    if (!extension || extension === fileName.toLowerCase()) {
      throw new Error("Unable to determine the file extension.");
    }

    const parser = fileParsers[extension];
    if (!parser) {
      throw new Error(`Unsupported file format: .${extension}. Supported formats: .xlsx, .xls, .dat.`);
    }

    const timestamp = Date.now();
    const rows = parser(buffer);
    const recordCount = updateIds(rows, timestamp);
    const nonEmptyRows = rows.filter((row) =>
      row.some((value) => String(value ?? "").trim() !== "")
    );

    const response: WorkerResponse = {
      type: "success",
      csv: generateCsv(nonEmptyRows),
      recordCount,
      elapsedMs: Math.round(performance.now() - startedAt),
      generatedAt: new Date(timestamp).toISOString(),
    };

    workerScope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      message: error instanceof Error ? error.message : "The file could not be processed.",
    };
    workerScope.postMessage(response);
  }
};

export {};
