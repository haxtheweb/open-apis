// xlsxToCsv.js
// Convert Excel files (.xls, .xlsx) to CSV format
import { stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";
import * as XLSX from 'xlsx';

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

export default async function handler(req, res) {
  let responseHandled = false;
  
  // Accept additional parameters for sheet selection and formatting
  const sheetName = req.query?.sheet || null;
  const includeHeaders = req.query?.headers !== 'false';
  
  
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
      
      // Parse Excel file
      const workbook = XLSX.read(fileInfo.data, { type: 'buffer' });
      
      // Determine which sheet to use
      let selectedSheetName = sheetName;
      if (!selectedSheetName || !workbook.SheetNames.includes(selectedSheetName)) {
        selectedSheetName = workbook.SheetNames[0];
      }
      
      if (!selectedSheetName) {
        throw new Error('No sheets found in Excel file');
      }
      
      const worksheet = workbook.Sheets[selectedSheetName];
      
      // Convert to CSV
      const csvOptions = {
        header: includeHeaders ? 1 : 0,
        blankrows: false,
        strip: true,
      };
      
      const csvData = XLSX.utils.sheet_to_csv(worksheet, csvOptions)
        .split('\n')
        .filter(line => line.trim().length > 0)
        .join('\n');
      
      
      res = stdResponse(res, {
        contents: csvData,
        filename: fileInfo.filename,
        originalFilename: fileInfo.filename,
        sheetNames: workbook.SheetNames,
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