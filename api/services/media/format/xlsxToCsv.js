// xlsxToCsv.js
// Convert Excel files (.xls, .xlsx) to CSV format
import { stdResponse } from "../../../_utilities/requestHelpers.js";
import ExcelJS from 'exceljs';

// Helper function to parse multipart form data manually
function parseMultipartData(buffer, boundary) {
  const data = buffer.toString('binary');
  const parts = data.split('--' + boundary);
  
  for (const part of parts) {
    if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
      // Extract filename
      const filenameMatch = part.match(/filename="([^"]+)"/);
      if (!filenameMatch) continue;
      
      const filename = filenameMatch[1];
      
      // Find the start of file data (after headers)
      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) continue;
      
      // Extract file data
      const fileDataStart = headerEndIndex + 4;
      let fileData = part.substring(fileDataStart);
      
      // Remove trailing CRLF if present
      fileData = fileData.replace(/\r\n$/, '');
      
      return {
        filename: filename,
        data: Buffer.from(fileData, 'binary')
      };
    }
  }
  return null;
}
function escapeCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  const requiresQuotes =
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (requiresQuotes) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function worksheetToCsv(worksheet, includeHeaders) {
  const rows = [];
  let maxColumns = 0;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.cellCount > maxColumns) {
      maxColumns = row.cellCount;
    }
  });

  if (maxColumns === 0) {
    return '';
  }

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const serializedRow = [];
    let hasValues = false;

    for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber++) {
      const cellText = row.getCell(columnNumber).text;
      const normalizedValue =
        cellText === null || cellText === undefined ? '' : String(cellText);

      if (normalizedValue.trim() !== '') {
        hasValues = true;
      }

      serializedRow.push(escapeCsvValue(normalizedValue));
    }

    if (hasValues) {
      rows.push(serializedRow.join(','));
    }
  }

  if (!includeHeaders && rows.length > 0) {
    rows.shift();
  }

  return rows.join('\n');
}

export default async function handler(req, res) {
  let responseHandled = false;
  
  // Accept additional parameters for sheet selection and formatting
  const query = req.query || {};
  const sheetName = query.sheet || null;
  const includeHeaders = query.headers !== 'false';
  
  
  // Read raw request body
  const chunks = [];
  
  req.on('data', (chunk) => {
    chunks.push(chunk);
  });
  
  req.on('end', async () => {
    try {
      const rawBody = Buffer.concat(chunks);
      
      // Extract boundary from Content-Type
      const contentType = req.headers['content-type'];
      const boundaryMatch = contentType.match(/boundary=([^;]+)/);
      if (!boundaryMatch) {
        throw new Error('No boundary found in Content-Type header');
      }
      
      const boundary = boundaryMatch[1];
      
      // Parse multipart data
      const fileInfo = parseMultipartData(rawBody, boundary);
      if (!fileInfo) {
        throw new Error('No file found in multipart data');
      }
      
      // Validate file extension
      const validExtensions = ['.xls', '.xlsx'];
      const hasValidExtension = validExtensions.some(ext => 
        fileInfo.filename.toLowerCase().endsWith(ext)
      );
      
      if (!hasValidExtension) {
        throw new Error(`Invalid file type. Expected .xls or .xlsx, got: ${fileInfo.filename}`);
      }

      if (fileInfo.filename.toLowerCase().endsWith('.xls')) {
        throw new Error('Legacy .xls files are not supported by this converter. Please save as .xlsx and retry');
      }
      
      // Parse Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileInfo.data);
      const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
      
      // Determine which sheet to use
      let selectedSheetName = sheetName;
      if (!selectedSheetName || !sheetNames.includes(selectedSheetName)) {
        selectedSheetName = sheetNames[0];
      }
      
      if (!selectedSheetName) {
        throw new Error('No sheets found in Excel file');
      }
      
      const worksheet = workbook.getWorksheet(selectedSheetName);
      if (!worksheet) {
        throw new Error(`Unable to access worksheet: ${selectedSheetName}`);
      }
      
      // Convert to CSV
      const csvData = worksheetToCsv(worksheet, includeHeaders);
      
      
      res = stdResponse(res, {
        contents: csvData,
        filename: fileInfo.filename,
        originalFilename: fileInfo.filename,
        sheetNames,
        selectedSheet: selectedSheetName,
        format: 'csv'
      });
      
    } catch (error) {
      console.error('xlsxToCsv: Error processing file:', error.message);
      res = stdResponse(res, {
        error: `Error processing Excel file: ${error.message}`,
        contents: '',
        filename: null
      }, { status: 400 });
    }
  });
  
  req.on('error', (err) => {
    console.error('xlsxToCsv: Request error:', err.message);
    res = stdResponse(res, { error: err.message }, { status: 500 });
  });
}