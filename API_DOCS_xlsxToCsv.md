# Excel to CSV Conversion API

## Endpoint
`POST /api/services/media/format/xlsxToCsv`

## Description
Converts Excel files (.xls, .xlsx) to CSV format for use with HAX Merlin File Wand and table creation workflows.

## Request Format
- **Method**: POST
- **Content-Type**: multipart/form-data
- **File Field**: Any field name (e.g., `file`, `upload`, etc.)

### Query Parameters (Optional)
- `sheet` (string): Name of the specific sheet to convert. If not provided, uses the first sheet.
- `headers` (boolean): Whether to include headers. Default is `true`. Set to `false` to exclude headers.

### Supported File Types
- `.xls` (Excel 97-2003)
- `.xlsx` (Excel 2007+)
- Various MIME types:
  - `application/vnd.ms-excel`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/octet-stream`
  - `application/excel`
  - `application/x-excel`
  - `application/x-msexcel`

## Response Format

### Success Response (200)
```json
{
  "data": {
    "contents": "Name,Age,City\\nJohn,25,New York\\nJane,30,Boston",
    "filename": "example.xlsx",
    "originalFilename": "example.xlsx",
    "sheetNames": ["Sheet1", "Sheet2", "Data"],
    "selectedSheet": "Sheet1",
    "format": "csv"
  },
  "status": 200
}
```

### Error Response (400)
```json
{
  "data": {
    "error": "Error parsing Excel file: Invalid file format",
    "contents": "",
    "filename": "example.xlsx",
    "sheetNames": []
  },
  "status": 400
}
```

## Usage Examples

### Basic Usage
```bash
curl -X POST \\
  'https://your-domain.vercel.app/api/services/media/format/xlsxToCsv' \\
  -F 'file=@path/to/your/file.xlsx'
```

### With Sheet Selection
```bash
curl -X POST \\
  'https://your-domain.vercel.app/api/services/media/format/xlsxToCsv?sheet=Data&headers=true' \\
  -F 'file=@path/to/your/file.xlsx'
```

### JavaScript/Fetch Example
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/services/media/format/xlsxToCsv?headers=true', {
  method: 'POST',
  body: formData
});

const result = await response.json();
const csvData = result.data.contents;
```

## Integration with Merlin File Wand

The CSV output from this endpoint is designed to work seamlessly with the Merlin File Wand functionality:

1. **File Upload**: Users drop Excel files into Merlin
2. **Conversion**: Files are automatically sent to this endpoint
3. **Table Generation**: The returned CSV data is parsed and converted to HTML `<table>` elements
4. **Page Integration**: Tables are inserted into HAX pages

### Expected CSV Format
- Comma-separated values
- Proper escaping of quotes and special characters
- Consistent line endings (\\n)
- Optional headers based on `headers` parameter

## Error Handling

The endpoint handles various error conditions:
- **Invalid file types**: Returns 400 with appropriate error message
- **Corrupted Excel files**: Returns 400 with parsing error details
- **Empty files**: Returns 400 with "No valid Excel file uploaded" message
- **Missing sheets**: Returns 400 if specified sheet doesn't exist
- **Upload errors**: Returns 400 with busboy error details

## Performance Considerations

- **Memory**: Configured with 1024MB memory limit
- **Timeout**: 300 seconds maximum execution time
- **File Size**: Recommended maximum ~50MB Excel files for optimal performance
- **Sheets**: Large sheets with 10,000+ rows may take longer to process

## Security Features

- **File Type Validation**: Both MIME type and file extension checking
- **Size Limits**: Vercel enforces request body size limits
- **Error Sanitization**: Error messages don't expose internal system details

## Dependencies

- `xlsx` (v0.18.5): Excel parsing and CSV conversion
- `busboy` (v1.6.0): Multipart form parsing
- `concat-stream` (v2.0.0): Stream buffer handling