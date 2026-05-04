// @haxcms/pptxToSite
import { stdResponse } from "../../_utilities/requestHelpers.js";
import { JSONOutlineSchemaItem } from "../../_utilities/apps/haxcms/lib/JSONOutlineSchemaItem.js";
import { cleanTitle, validURL } from "../../_utilities/apps/haxcms/lib/JOSHelpers.js";
import { parse } from "node-html-parser";
import { PPTXInHTMLOut } from "pptx-in-html-out";
import { stripMSWord } from "../../_utilities/htmlScrubbers.js";
import { sanitizePptxMediaForOCR } from "../../_utilities/pptxHelpers.js";

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
    if (!hasValidPptxInput(formData.file.filename, formData.file.mimeType)) {
      throw new Error(`Invalid file type. Expected .pptx, got: ${formData.file.filename}`);
    }

    const type = formData.fields.type || "";
    const method = formData.fields.method || "site";
    const parentIdField = formData.fields.parentId;
    const parentId = parentIdField && parentIdField !== "null" ? parentIdField : null;

    try {
      const sanitizedPptxBuffer = await sanitizePptxMediaForOCR(formData.file.data);
      const converter = new PPTXInHTMLOut(sanitizedPptxBuffer);
      html = await converter.toHTML();
      html = stripMSWord(html);
    }
    catch (e) {
      html = "";
      throw new Error(`Error converting PPTX: ${e.message}`);
    }

    const doc = parse(`<div id=\"pptx-import-wrapper\">${html}</div>`);
    const items = [];
    const titleValue = getFileTitle(formData.file.filename);
    let order;
    switch (method) {
      case "site":
        const h1s = doc.querySelectorAll("h1");
        let h1Order = 0;
        if (h1s.length === 0) {
          items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector("#pptx-import-wrapper")), parentId));
        }
        else {
          for await (const h1 of h1s) {
            const item = new JSONOutlineSchemaItem();
            item.title = h1.innerText.trim().replace("  ", " ").replace("  ", " ");
            item.slug = cleanTitle(item.title);
            item.order = h1Order;
            item.parent = parentId;
            h1Order += 1;
            const tmp = await nextUntilElement(h1, ["H1"]);
            const h1Children = tmp.siblings;
            let contents = "";
            let h2 = null;
            for await (const h1Child of h1Children) {
              if (h1Child.tagName === "H2") {
                h2 = h1Child;
                break;
              }
              else if (h2 === null) {
                contents += htmlFromEl(h1Child);
              }
            }
            item.contents = contents !== "" ? contents : getFallbackContent(type);
            items.push(item);
            if (h2) {
              let h2Order = 0;
              while (h2 !== null && h2.tagName === "H2") {
                const item2 = new JSONOutlineSchemaItem();
                item2.title = h2.innerText.trim().replace("  ", " ").replace("  ", " ");
                item2.slug = item.slug + "/" + cleanTitle(item2.title);
                item2.order = h2Order;
                h2Order += 1;
                item2.indent = 1;
                item2.parent = item.id;
                const tmp = await nextUntilElement(h2, ["H1", "H2"]);
                const h2Children = tmp.siblings;
                h2 = tmp.lastEl;
                let contents2 = "";
                for await (const h2Child of h2Children) {
                  contents2 += htmlFromEl(h2Child);
                }
                item2.contents = contents2 !== "" ? contents2 : "<p></p>";
                items.push(item2);
              }
            }
          }
        }
      break;
      case "branch":
        const els = doc.querySelectorAll("h1");
        order = 0;
        if (els.length === 0) {
          items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector("#pptx-import-wrapper")), parentId));
        }
        else {
          for await (const h1 of els) {
            const item = new JSONOutlineSchemaItem();
            item.title = h1.innerText.trim().replace("  ", " ").replace("  ", " ");
            item.slug = cleanTitle(item.title);
            item.order = order;
            item.parent = parentId;
            order += 1;
            const tmp = await nextUntilElement(h1, ["H1"]);
            const h1Children = tmp.siblings;
            let contents = "";
            for await (const h1Child of h1Children) {
              contents += htmlFromEl(h1Child);
            }
            item.contents = contents !== "" ? contents : getFallbackContent(type);
            items.push(item);
          }
        }
      break;
      case "page":
      default:
        items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector("#pptx-import-wrapper")), parentId));
      break;
    }

    res = stdResponse(res, {
      items: items,
      filename: formData.file.filename,
    });
  }
  catch (error) {
    console.error("pptxToSite: Error processing file:", error.message);
    res = stdResponse(
      res,
      {
        error: `Error processing PPTX import: ${error.message}`,
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
        mimeType: mimeTypeMatch && mimeTypeMatch[1] ? mimeTypeMatch[1].trim() : null,
        data: Buffer.from(partData, "binary"),
      };
    }
    else {
      result.fields[nameMatch[1]] = partData;
    }
  }
  return result;
}

function hasValidPptxInput(filename, mimeType) {
  if (!filename || typeof filename !== "string") {
    return false;
  }
  const validMimeTypes = [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/octet-stream",
  ];
  return /\.pptx$/i.test(filename) && (!mimeType || validMimeTypes.includes(mimeType));
}

function getFileTitle(filename) {
  if (!filename || typeof filename !== "string") {
    return "new page";
  }
  return filename.replace(/\.pptx$/i, "");
}

function processSinglePageContent(wrapperEl) {
  if (!wrapperEl) {
    return "<p></p>";
  }
  let content = "";
  for (const child of wrapperEl.childNodes) {
    if (child && child.tagName) {
      content += htmlFromEl(child);
    }
  }
  return content !== "" ? content : wrapperEl.innerHTML;
}

function importSinglePage(title, content, pValue) {
  const item = new JSONOutlineSchemaItem();
  item.title = title;
  item.slug = cleanTitle(item.title);
  item.order = 0;
  item.parent = pValue;
  item.contents = content;
  return item;
}

// replacement for tabs, also support for single line video player calls
function htmlFromEl(el) {
  let textValue = el.innerText.trim();
  if (
    validURL(textValue) &&
    (textValue.includes("youtube.com") ||
      textValue.includes("youtu.be") ||
      textValue.includes("youtube-nocookie.com") ||
      textValue.includes("vimeo.com") ||
      textValue.toLowerCase().includes(".mp4"))
  ) {
    return `<video-player source="${textValue}"></video-player>`;
  }
  else if (
    validURL(textValue) &&
    (textValue.toLowerCase().includes(".jpg") ||
      textValue.toLowerCase().includes(".jpeg") ||
      textValue.toLowerCase().includes(".png") ||
      textValue.toLowerCase().includes(".webp"))
  ) {
    return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
  }
  else if (validURL(textValue) && textValue.toLowerCase().includes(".gif")) {
    return `
    <a11y-gif-player src="${textValue}" style="width: 300px;">
      <simple-img width="300" src="${textValue}"></simple-img>
    </a11y-gif-player>`;
  }
  else if (textValue.startsWith("[") && textValue.endsWith("]")) {
    let tmp = textValue.split(":");
    if (tmp.length > 1) {
      const type = tmp.shift().replace("[", "");
      const text = tmp.join(":").replace("]", "").trim();
      switch (type) {
        case "math":
        case "mathjax":
          return `<lrn-math>${text}</lrn-math>`;
        case "video":
        case "audio":
        case "document":
        case "text":
        case "image":
          return `<place-holder type="${type}" text="${text}"></place-holder>`;
      }
    }
    textValue = textValue.replace("[", "").replace("]", "").trim();
    if (
      validURL(textValue) &&
      (textValue.includes("youtube.com") ||
        textValue.includes("youtu.be") ||
        textValue.includes("youtube-nocookie.com") ||
        textValue.includes("vimeo.com") ||
        textValue.includes("twitch.tv") ||
        textValue.toLowerCase().includes(".mp4"))
    ) {
      return `<video-player source="${textValue}"></video-player>`;
    }
    else if (
      validURL(textValue) &&
      (textValue.toLowerCase().includes(".jpg") ||
        textValue.toLowerCase().includes(".jpeg") ||
        textValue.toLowerCase().includes(".png") ||
        textValue.toLowerCase().includes(".webp"))
    ) {
      return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
    }
    else if (validURL(textValue) && textValue.toLowerCase().includes(".gif")) {
      return `
      <a11y-gif-player src="${textValue}" style="width: 300px;">
        <simple-img width="300" src="${textValue}"></simple-img>
      </a11y-gif-player>`;
    }
    else {
      return `<place-holder type="text" text="${textValue}"></place-holder>`;
    }
  }
  else if (textValue.startsWith("!") && textValue.includes("-")) {
    const tag = textValue.replace("!", "").trim();
    return `<${tag}></${tag}>`;
  }
  const content = el.outerHTML.replace(/\t/g, "").trim().replace(/\[math:(.*?)\]/g, "<lrn-math>$1</lrn-math>");
  return content;
}

// based on https://vanillajstoolkit.com/helpers/nextuntil/
async function nextUntilElement(elem, tagMatches) {
  const siblings = [];
  elem = elem.nextElementSibling;
  while (elem) {
    if (tagMatches.includes(elem.tagName)) {
      break;
    }
    siblings.push(elem);
    elem = elem.nextElementSibling;
  }
  return {
    siblings: siblings,
    lastEl: elem,
  };
}

function getFallbackContent(type) {
  switch (type) {
    case "portfolio":
      return `<p>Enjoy my portfolio and let me know if you have questions.</p>
<lesson-overview>
  <lesson-highlight smart="pages"></lesson-highlight>
</lesson-overview>`;
    case "course":
      return `<p>Welcome to the lesson.</p>
<lesson-overview>
  <lesson-highlight smart="pages"></lesson-highlight>
  <lesson-highlight smart="readTime"></lesson-highlight>
  <lesson-highlight smart="selfChecks"></lesson-highlight>
  <lesson-highlight smart="audio"></lesson-highlight>
  <lesson-highlight smart="video"></lesson-highlight>
</lesson-overview>
<p>Let's begin!</p>`;
    default:
      return "<p></p>";
  }
}
