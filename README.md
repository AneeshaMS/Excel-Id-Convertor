# Excel ID Converter

A frontend-only React + TypeScript application that reads the first worksheet of an Excel workbook, replaces Column A IDs for non-empty data rows, and downloads the result as CSV.

## Requirements implemented

- Accepts `.xlsx` and `.xls`.
- Treats the first row as a header and leaves it unchanged.
- Processes only the first worksheet.
- Replaces Column A for every non-empty data row.
- Generates IDs as `100123 + timestamp + sequence`.
- Stores generated IDs as strings to avoid Excel numeric precision loss.
- Exports the first worksheet as CSV.
- Uses a Web Worker so Excel parsing and conversion do not block the UI thread.
- Processes the file locally in the browser; no backend or file upload is used.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy to Netlify

Connect this repository to Netlify and use:

- Build command: `npm run build`
- Publish directory: `dist`

The included `netlify.toml` already contains these settings.

## ID format

For one conversion, the application creates one timestamp and appends an incrementing, zero-padded sequence:

- `100123<timestamp>000001`
- `100123<timestamp>000002`
- `100123<timestamp>000003`

This guarantees distinct IDs for data rows within one generated CSV. It does not guarantee globally unique IDs across separate users or independently generated files because there is no shared server-side ID allocator.

## Performance note

The Web Worker keeps the interface responsive while parsing and converting. Actual completion time depends on file size, row/column count, workbook complexity, device CPU, and available memory. A strict five-second guarantee cannot be made for every Excel file without defining and benchmarking a maximum supported file size and row count.

The displayed processing time measures worker-side parsing and conversion. It does not include file selection, the browser's `arrayBuffer()` read, or the user's download time.

## Current assumptions

- The first row of the first worksheet contains column headers.
- Column A is the ID column.
- Entirely blank rows are ignored.
- The CSV contains the first worksheet only.
- Formula cells are exported using their cached/calculated values; formulas and Excel formatting are not preserved in CSV.
