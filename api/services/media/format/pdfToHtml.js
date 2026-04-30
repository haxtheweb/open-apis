// pdfToHtml
import { stdResponse } from "../../../utilities/requestHelpers.js";
import busboy from "busboy";
import concat from "concat-stream";
import { convertPdfBufferToHtml } from "../../../apps/haxcms/lib/pdfToSemanticHtml.js";

export default async function handler(req, res) {
  let html = "";
  const buffer = {
    filename: null,
    data: null,
  };

  const bb = busboy({ headers: req.headers });
  bb.on("file", async (name, file, info) => {
    const { filename, mimeType } = info;
    if (filename && hasValidPdfInput(filename, mimeType)) {
      file.pipe(
        concat((fileBuffer) => {
          buffer.filename = filename;
          buffer.data = fileBuffer;
        }),
      );
    }
  });

  bb.on("close", async () => {
    if (!buffer.data) {
      res = stdResponse(
        res,
        {
          error: "No valid PDF file was uploaded",
          contents: "",
          filename: null,
        },
        { status: 400 },
      );
      return;
    }

    try {
      html = await convertPdfBufferToHtml(buffer.data);
    }
    catch (e) {
      html = "";
      res = stdResponse(
        res,
        {
          error: `Error converting PDF: ${e.message}`,
          contents: html,
          filename: buffer.filename,
        },
        { status: 400 },
      );
      return;
    }

    res = stdResponse(res, {
      contents: html,
      filename: buffer.filename,
    });
  });

  bb.on("error", (err) => {
    res = stdResponse(
      res,
      {
        error: `File upload error: ${err.message}`,
        contents: "",
        filename: null,
      },
      { status: 500 },
    );
  });

  req.pipe(bb);
}

function hasValidPdfInput(filename, mimeType) {
  if (!filename || typeof filename !== "string") {
    return false;
  }
  const validMimeTypes = ["application/pdf", "application/x-pdf", "application/octet-stream"];
  return /\.pdf$/i.test(filename) && (!mimeType || validMimeTypes.includes(mimeType));
}
