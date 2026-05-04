// pdfToHtml
import { stdResponse } from "../../../_utilities/requestHelpers.js";
import { convertPdfBufferToHtml } from "../../../_utilities/apps/haxcms/lib/pdfToSemanticHtml.js";
import { stripMSWord } from "../../../_utilities/htmlScrubbers.js";

export default async function handler(req, res) {
  let html = "";
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
    if (!hasValidPdfInput(formData.file.filename, formData.file.mimeType)) {
      throw new Error(`Invalid file type. Expected .pdf, got: ${formData.file.filename}`);
    }
    try {
      html = await convertPdfBufferToHtml(formData.file.data);
      html = stripMSWord(html);
    }
    catch (e) {
      html = "";
      throw new Error(`Error converting PDF: ${e.message}`);
    }
    res = stdResponse(res, {
      contents: html,
      filename: formData.file.filename,
    });
  }
  catch (error) {
    console.error("pdfToHtml: Error processing file:", error.message);
    res = stdResponse(
      res,
      {
        error: `Error processing PDF document: ${error.message}`,
        contents: "",
        filename: filename,
      },
      { status: 400 },
    );
  }
}

function hasValidPdfInput(filename, mimeType) {
  if (!filename || typeof filename !== "string") {
    return false;
  }
  const validMimeTypes = ["application/pdf", "application/x-pdf", "application/octet-stream"];
  return /\.pdf$/i.test(filename) && (!mimeType || validMimeTypes.includes(mimeType));
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
    const filenameMatch = headerText.match(/filename=\"([^\"]+)\"/);
    if (!filenameMatch || !filenameMatch[1]) {
      continue;
    }
    const mimeTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
    let partData = part.substring(headerEndIndex + 4);
    partData = partData.replace(/\r\n$/, "");
    result.file = {
      filename: filenameMatch[1],
      mimeType: mimeTypeMatch && mimeTypeMatch[1] ? mimeTypeMatch[1].trim() : null,
      data: Buffer.from(partData, "binary"),
    };
    break;
  }
  return result;
}
