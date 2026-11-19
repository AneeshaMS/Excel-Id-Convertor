/// <reference lib="webworker" />
import * as XLSX from "xlsx";
import type { WorkerRequest, WorkerResponse } from "../types";

const workerScope = self as DedicatedWorkerGlobalScope;
const SEQUENCE_WIDTH = 1;

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const startedAt = performance.now();

  try {
    const workbook = XLSX.read(event.data.buffer, {
      type: "array",
      cellDates: false,
      // We only export the first worksheet. SheetJS reads the workbook
      // structure, then the conversion below touches only that worksheet.
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("The workbook does not contain a worksheet.");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet || !worksheet["!ref"]) {
      throw new Error("The first worksheet is empty.");
    }

    const range = XLSX.utils.decode_range(worksheet["!ref"]);

    // The first worksheet row is the header. Data starts on the next row.
    const firstDataRow = Math.max(range.s.r + 1, 1);
    const timestamp = Date.now();
    let recordCount = 0;

    for (let row = firstDataRow; row <= range.e.r; row += 1) {
      let rowHasData = false;

      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = worksheet[address];

        if (
          cell &&
          cell.v !== undefined &&
          cell.v !== null &&
          String(cell.v).trim() !== ""
        ) {
          rowHasData = true;
          break;
        }
      }

      // Ignore fully empty rows; do not create IDs for them.
      if (!rowHasData) continue;

      recordCount += 1;
     const idAddress = XLSX.utils.encode_cell({ r: row, c: 0 });

// Get original ID
const originalId = worksheet[idAddress]?.v;

if (originalId === undefined || originalId === null || String(originalId).trim() === "") {
  throw new Error(`Missing ID in Column A at row ${row + 1}`);
}

// Extract first 7 characters
const prefix = String(originalId).trim().slice(0, 7);

// Generate new unique ID
const newId = `${prefix}${timestamp}${String(recordCount).padStart(SEQUENCE_WIDTH, "0")}`;

// Update Column A
worksheet[idAddress] = {
  t: "s",
  v: newId,
};
    }

    if (recordCount === 0) {
      throw new Error("No data rows were found below the header row.");
    }

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
          : "The file could not be processed.",
    };

    workerScope.postMessage(response);
  }
};

export {};