// @haxcms/xlsxToSite
import { stdResponse } from "../../_utilities/requestHelpers.js";
import { JSONOutlineSchemaItem } from "../../_utilities/apps/haxcms/lib/JSONOutlineSchemaItem.js";
import * as XLSX from "xlsx";

const EXPECTED_HEADERS = ["title", "slug", "parent", "content"];
const ROOT_ORDER_KEY = "__root__";

export default async function handler(req, res) {
  let filename = null;
  try {
    const rawBody = await getRequestBodyBuffer(req);
    if (!rawBody || rawBody.length === 0) {
      throw new Error("No request body received");
    }
    const contentType = req.headers["content-type"] || "";
    const boundary = getMultipartBoundary(contentType);
    if (!boundary) {
      throw new Error("No boundary found in Content-Type header");
    }
    const formData = parseMultipartData(rawBody, boundary);
    if (!formData || !formData.file) {
      throw new Error("No file found in multipart data");
    }
    filename = formData.file.filename;
    if (!hasValidExcelInput(formData.file.filename, formData.file.mimeType)) {
      throw new Error(
        `Invalid file type. Expected .xlsx or .xls, got: ${formData.file.filename}`,
      );
    }
    const workbook = XLSX.read(formData.file.data, {
      type: "buffer",
      cellDates: false,
      cellText: true,
    });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("No sheets found in Excel file");
    }
    const requestedSheet =
      req.query && typeof req.query.sheet === "string"
        ? req.query.sheet.trim()
        : "";
    let selectedSheet = requestedSheet;
    if (!selectedSheet || !workbook.SheetNames.includes(selectedSheet)) {
      selectedSheet = workbook.SheetNames[0];
    }
    const worksheet = workbook.Sheets[selectedSheet];
    if (!worksheet) {
      throw new Error(`Sheet not found: ${selectedSheet}`);
    }
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const items = rowsToSiteItems(rows);
    res = stdResponse(res, {
      items: items,
      filename: formData.file.filename,
      selectedSheet: selectedSheet,
      sheetNames: workbook.SheetNames,
      headers: EXPECTED_HEADERS,
    });
  } catch (error) {
    console.error("xlsxToSite: Error processing file:", error.message);
    res = stdResponse(
      res,
      {
        error: `Error processing Excel import: ${error.message}`,
        items: [],
        filename: filename,
      },
      { status: 400 },
    );
  }
}

async function getRequestBodyBuffer(req) {
  const body = req.rawBody || req.body;
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

function getMultipartBoundary(contentType) {
  const match = String(contentType).match(/boundary=([^;]+)/i);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].trim();
}

function parseMultipartData(buffer, boundary) {
  const data = buffer.toString("binary");
  const parts = data.split("--" + boundary);
  const result = {
    fields: {},
    file: null,
  };
  for (const part of parts) {
    if (!part || part === "--" || part === "--\r\n" || part === "\r\n") {
      continue;
    }
    const headerEndIndex = part.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) {
      continue;
    }
    const headerText = part.substring(0, headerEndIndex);
    if (!headerText.includes("Content-Disposition: form-data")) {
      continue;
    }
    const nameMatch = headerText.match(/name=\"([^\"]+)\"/);
    if (!nameMatch || !nameMatch[1]) {
      continue;
    }
    let partData = part.substring(headerEndIndex + 4);
    partData = partData.replace(/\r\n$/, "");
    const filenameMatch = headerText.match(/filename=\"([^\"]+)\"/);
    if (filenameMatch && filenameMatch[1]) {
      const mimeTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
      result.file = {
        fieldName: nameMatch[1],
        filename: filenameMatch[1],
        mimeType:
          mimeTypeMatch && mimeTypeMatch[1] ? mimeTypeMatch[1].trim() : null,
        data: Buffer.from(partData, "binary"),
      };
    } else {
      result.fields[nameMatch[1]] = partData;
    }
  }
  return result;
}

function hasValidExcelInput(filename, mimeType) {
  if (!filename || typeof filename !== "string") {
    return false;
  }
  const validMimeTypes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "application/excel",
    "application/x-excel",
    "application/x-msexcel",
  ];
  return (
    /\.(xlsx|xls)$/i.test(filename) &&
    (!mimeType || validMimeTypes.includes(mimeType))
  );
}

function rowsToSiteItems(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Spreadsheet is empty");
  }
  let headerRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rowHasData(rows[i])) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    throw new Error("Spreadsheet has no header row");
  }
  const headerLookup = getHeaderLookup(rows[headerRowIndex]);
  const records = [];
  const slugMap = {};
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!rowHasData(row)) {
      continue;
    }
    const rowNumber = i + 1;
    const title = valueToString(row[headerLookup.title]).trim();
    const rawSlug = valueToString(row[headerLookup.slug]).trim();
    const rawParent = valueToString(row[headerLookup.parent]).trim();
    const rawContent = valueToString(row[headerLookup.content]);
    if (title === "") {
      throw new Error(`Row ${rowNumber}: title is required`);
    }
    if (rawSlug === "") {
      throw new Error(`Row ${rowNumber}: slug is required`);
    }
    const slug = normalizeSlug(rawSlug);
    if (slug === "") {
      throw new Error(`Row ${rowNumber}: slug is required`);
    }
    const slugKey = slug.toLowerCase();
    if (slugMap[slugKey]) {
      throw new Error(
        `Row ${rowNumber}: duplicate slug "${slug}" (already used on row ${slugMap[slugKey].rowNumber})`,
      );
    }
    const parentSlug = normalizeSlug(rawParent);
    const parentSlugKey = parentSlug === "" ? "" : parentSlug.toLowerCase();
    const item = new JSONOutlineSchemaItem();
    item.title = title;
    item.slug = slug;
    item.contents = contentToHtml(rawContent);
    records.push({
      slugKey: slugKey,
      parentSlugKey: parentSlugKey,
      rowNumber: rowNumber,
      item: item,
    });
    slugMap[slugKey] = {
      item: item,
      parentSlugKey: parentSlugKey,
      rowNumber: rowNumber,
    };
  }
  if (records.length === 0) {
    throw new Error("No page rows found after header row");
  }
  for (const record of records) {
    if (!record.parentSlugKey) {
      continue;
    }
    if (record.parentSlugKey === record.slugKey) {
      throw new Error(
        `Row ${record.rowNumber}: parent slug cannot reference itself (${record.item.slug})`,
      );
    }
    if (!slugMap[record.parentSlugKey]) {
      throw new Error(
        `Row ${record.rowNumber}: parent slug "${record.parentSlugKey}" was not found in the sheet`,
      );
    }
  }
  const depthCache = {};
  for (const record of records) {
    record.item.indent = computeDepth(record.slugKey, slugMap, depthCache, {});
  }
  const orderMap = {};
  for (const record of records) {
    let parentId = null;
    if (record.parentSlugKey) {
      parentId = slugMap[record.parentSlugKey].item.id;
    }
    record.item.parent = parentId;
    const orderKey = parentId || ROOT_ORDER_KEY;
    if (typeof orderMap[orderKey] === "undefined") {
      orderMap[orderKey] = 0;
    }
    record.item.order = orderMap[orderKey];
    orderMap[orderKey] += 1;
  }
  return records.map((record) => record.item);
}

function rowHasData(row) {
  if (!Array.isArray(row)) {
    return false;
  }
  for (const value of row) {
    if (valueToString(value).trim() !== "") {
      return true;
    }
  }
  return false;
}

function getHeaderLookup(headerRow) {
  const lookup = {};
  if (!Array.isArray(headerRow)) {
    throw new Error(
      `Header row must include exactly ${EXPECTED_HEADERS.join(", ")}`,
    );
  }
  for (let index = 0; index < headerRow.length; index++) {
    const header = normalizeHeader(headerRow[index]);
    if (header === "") {
      continue;
    }
    if (lookup[header]) {
      throw new Error(`Duplicate header "${header}" in spreadsheet`);
    }
    lookup[header] = index;
  }
  const foundHeaders = Object.keys(lookup);
  const missingHeaders = EXPECTED_HEADERS.filter(
    (header) => typeof lookup[header] !== "number",
  );
  const extraHeaders = foundHeaders.filter(
    (header) => !EXPECTED_HEADERS.includes(header),
  );
  if (
    missingHeaders.length > 0 ||
    extraHeaders.length > 0 ||
    foundHeaders.length !== EXPECTED_HEADERS.length
  ) {
    throw new Error(
      `Header row must include exactly ${EXPECTED_HEADERS.join(", ")}`,
    );
  }
  return lookup;
}

function normalizeHeader(value) {
  return valueToString(value).trim().toLowerCase();
}

function normalizeSlug(value) {
  return valueToString(value).trim().replace(/^\/+|\/+$/g, "");
}

function valueToString(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return `${value}`;
}

function computeDepth(slugKey, slugMap, cache, stack) {
  if (typeof cache[slugKey] === "number") {
    return cache[slugKey];
  }
  if (stack[slugKey]) {
    throw new Error(`Circular parent relationship detected at slug "${slugKey}"`);
  }
  stack[slugKey] = true;
  const record = slugMap[slugKey];
  if (!record) {
    throw new Error(`Unable to resolve slug "${slugKey}"`);
  }
  let depth = 0;
  if (record.parentSlugKey) {
    depth = computeDepth(record.parentSlugKey, slugMap, cache, stack) + 1;
  }
  delete stack[slugKey];
  cache[slugKey] = depth;
  return depth;
}

function contentToHtml(value) {
  const content = valueToString(value).trim();
  if (content === "") {
    return "<p></p>";
  }
  if (looksLikeHtml(content)) {
    return content;
  }
  return `<p>${escapeHtml(content).replace(/\n/g, "<br />")}</p>`;
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\w-]*(\s[^>]*)?>/i.test(value);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
