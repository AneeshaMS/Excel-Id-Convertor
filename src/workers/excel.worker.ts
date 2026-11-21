
/// <reference lib="webworker" />
import * as XLSX from "xlsx";
import type { WorkerRequest, WorkerResponse } from "../types";

const workerScope = self as DedicatedWorkerGlobalScope;

const ID_PREFIX_LENGTH = 6;
const SEQUENCE_WIDTH = 4;
const DELIMITER = "|";

/**
 * Parse pipe-separated DAT content.
 * Supports quoted values, escaped quotes and delimiters inside quotes.
 */
function parseDatFile(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === DELIMITER && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && content[i + 1] === "\n") {
        i++;
      }

      row.push(field);

      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Add the last row.
  row.push(field);

  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const startedAt = performance.now();

  try {
    // Read DAT file as text.
    const content = new TextDecoder("utf-8").decode(event.data.buffer);

    // Remove BOM if present.
    const cleanedContent = content.replace(/^\uFEFF/, "");

    const rows = parseDatFile(cleanedContent);

    if (rows.length < 2) {
      throw new Error("The DAT file contains no data rows.");
    }

    const timestamp = Date.now();
    let recordCount = 0;

    // First row contains headers.
    const headers = rows[0];
    const dataRows = rows.slice(1);

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // Ignore completely empty rows.
      if (row.every((value) => value.trim() === "")) {
        continue;
      }

      const originalId = row[0]?.trim();

      if (!originalId) {
        throw new Error(
          `Missing ID in Column A at data row ${i + 2}`
        );
      }

      recordCount++;

      // Extract first 6 characters as ID prefix.
      const prefix = originalId.slice(0, ID_PREFIX_LENGTH);

      // Generate unique ID.
      const sequence = String(recordCount).padStart(
        SEQUENCE_WIDTH,
        "0"
      );

      const newId = `${prefix}${timestamp}${sequence}`;

      // Replace Column A.
      row[0] = newId;
    }

    if (recordCount === 0) {
      throw new Error("No valid data records found.");
    }

    // Convert data into an Excel worksheet.
    const worksheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...dataRows.filter((row) =>
        row.some((value) => value.trim() !== "")
      ),
    ]);

    // Generate CSV.
    const csv = XLSX.utils.sheet_to_csv(worksheet, {
      FS: ",",
      RS: "\r\n",
    });

    const response: WorkerResponse = {
      type: "success",
      csv,
      recordCount,
      elapsedMs: Math.round(performance.now() - startedAt),
      generatedAt: new Date(timestamp).toISOString(),
    };

    workerScope.postMessage(response);

  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "The DAT file could not be processed.",
    };

    workerScope.postMessage(response);
  }
};

export {};
