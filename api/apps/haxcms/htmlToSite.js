// @haxcms/htmlToSite
import { stdPostBody, stdResponse } from "../../_utilities/requestHelpers.js";
import { JSONOutlineSchemaItem } from "../../_utilities/apps/haxcms/lib/JSONOutlineSchemaItem.js";
import { cleanTitle, validURL } from "../../_utilities/apps/haxcms/lib/JOSHelpers.js";
import { parse } from "node-html-parser";
import {
  extractBodyHtml,
  sanitizeUntrustedHtml,
  stripMSWord,
} from "../../_utilities/htmlScrubbers.js";

export default async function handler(req, res) {
  let filename = null;
  try {
    const importSource = await getHtmlImportSource(req);
    filename = importSource.filename;
    const method = importSource.method;
    const parentId = importSource.parentId;
    const cleanedHtml = sanitizeUntrustedHtml(
      stripMSWord(extractBodyHtml(importSource.html)),
    );
    const doc = parse(`<div id="html-import-wrapper">${cleanedHtml}</div>`);
    const items = [];
    const titleValue = getFileTitle(filename);
    let order;
    switch (method) {
      // h1 -> page, h2 -> child page, h3 -> heading, h4 -> subheading (container + page + structure import)
      case "site":
        const h1s = doc.querySelectorAll("h1");
        let h1Order = 0;
        if (h1s.length === 0) {
          items.push(
            importSinglePage(
              titleValue,
              processSinglePageContent(doc.querySelector("#html-import-wrapper")),
              parentId,
            ),
          );
        } else {
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
              } else if (h2 === null) {
                contents += htmlFromEl(h1Child);
              }
            }
            item.contents = contents !== "" ? contents : "<p></p>";
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
      // h1 -> page, h2 -> heading, h3 -> subheading, h4 -> sub-subheading (flat page structure import, file name === container)
      case "branch":
        const els = doc.querySelectorAll("h1");
        order = 0;
        if (els.length === 0) {
          items.push(
            importSinglePage(
              titleValue,
              processSinglePageContent(doc.querySelector("#html-import-wrapper")),
              parentId,
            ),
          );
        } else {
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
            item.contents = contents !== "" ? contents : "<p></p>";
            items.push(item);
          }
        }
      break;
      // h1 -> heading, h2 -> subheading, h3 -> sub-subheading, h4 -> sub-sub-subheading (single page import)
      case "page":
      default:
        items.push(
          importSinglePage(
            titleValue,
            processSinglePageContent(doc.querySelector("#html-import-wrapper")),
            parentId,
          ),
        );
      break;
    }
    res = stdResponse(res, {
      items: items,
      filename: filename,
    });
  } catch (error) {
    console.error("htmlToSite: Error processing file:", error.message);
    res = stdResponse(
      res,
      {
        error: `Error processing HTML import: ${error.message}`,
        items: [],
        filename: filename,
      },
      { status: 400 },
    );
  }
}

async function getHtmlImportSource(req) {
  let html = "";
  let filename = "import.html";
  let method = "site";
  let parentId = null;
  const contentType = req && req.headers ? req.headers["content-type"] || "" : "";
  const isMultipart = String(contentType).includes("multipart/form-data");
  if (isMultipart) {
    const rawBody = await getRequestBodyBuffer(req);
    if (!rawBody || rawBody.length === 0) {
      throw new Error("No request body received");
    }
    const boundary = getMultipartBoundary(contentType);
    if (!boundary) {
      throw new Error("No boundary found in Content-Type header");
    }
    const formData = parseMultipartData(rawBody, boundary);
    if (!formData || !formData.file) {
      throw new Error("No file found in multipart data");
    }
    filename = formData.file.filename;
    if (!hasValidHtmlInput(formData.file.filename, formData.file.mimeType)) {
      throw new Error(
        `Invalid file type. Expected .html or .htm, got: ${formData.file.filename}`,
      );
    }
    html = formData.file.data.toString("utf8");
    if (formData.fields.method) {
      method = formData.fields.method;
    }
    const parentIdField = formData.fields.parentId;
    if (parentIdField && parentIdField !== "null") {
      parentId = parentIdField;
    }
  } else {
    let body = {};
    if (req && req.query && req.query.repoUrl) {
      body = req.query;
    } else {
      body = stdPostBody(req);
    }
    if (!body || typeof body !== "object") {
      body = {};
    }
    if (body.method) {
      method = body.method;
    }
    if (body.parentId && body.parentId !== "null") {
      parentId = body.parentId;
    }
    if (body.filename && typeof body.filename === "string") {
      filename = body.filename;
    }
    if (body.repoUrl && typeof body.repoUrl === "string") {
      const fetched = await fetchHtmlFromUrl(body.repoUrl);
      html = fetched.html;
      filename = fetched.filename;
    } else if (body.html && typeof body.html === "string") {
      html = body.html;
    } else {
      throw new Error("Missing HTML input. Supply upload, repoUrl, or html");
    }
  }
  if (!["site", "branch", "page"].includes(method)) {
    method = "site";
  }
  return {
    html: html,
    filename: filename,
    method: method,
    parentId: parentId,
  };
}

async function fetchHtmlFromUrl(repoUrl) {
  let parsedUrl = null;
  try {
    parsedUrl = new URL(repoUrl);
  } catch (e) {
    throw new Error("Invalid repoUrl");
  }
  const response = await fetch(parsedUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch repoUrl: ${response.status}`);
  }
  const html = await response.text();
  const pathPart = parsedUrl.pathname ? parsedUrl.pathname.split("/").pop() : "";
  let filename = pathPart || parsedUrl.hostname || "import.html";
  if (!filename.includes(".")) {
    filename += ".html";
  }
  return {
    html: html,
    filename: filename,
  };
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
    } else {
      result.fields[nameMatch[1]] = partData;
    }
  }
  return result;
}

function hasValidHtmlInput(filename, mimeType) {
  if (!filename || typeof filename !== "string") {
    return false;
  }
  const validMimeTypes = [
    "text/html",
    "application/xhtml+xml",
    "text/plain",
    "application/octet-stream",
  ];
  return /\.(html|htm|xhtml)$/i.test(filename) && (!mimeType || validMimeTypes.includes(mimeType));
}

function getFileTitle(filename) {
  if (!filename || typeof filename !== "string") {
    return "new page";
  }
  return filename.replace(/\.(html|htm|xhtml)$/i, "");
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
  // test if this is a stand alone, valid URL
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
  // image
  else if (
    validURL(textValue) &&
    (textValue.toLowerCase().includes(".jpg") ||
      textValue.toLowerCase().includes(".jpeg") ||
      textValue.toLowerCase().includes(".png") ||
      textValue.toLowerCase().includes(".webp"))
  ) {
    return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
  }
  // gif
  else if (validURL(textValue) && textValue.toLowerCase().includes(".gif")) {
    return `
    <a11y-gif-player src="${textValue}" style="width: 300px;">
      <simple-img width="300" src="${textValue}"></simple-img>
    </a11y-gif-player>`;
  }
  // test for a common convention for a place holder
  else if (textValue.startsWith("[") && textValue.endsWith("]")) {
    let tmp = textValue.split(":");
    // test for a type definition vs just rendering a basic textual one
    if (tmp.length > 1) {
      let type = tmp.shift().replace("[", "");
      let text = tmp.join(":").replace("]", "").trim();
      // we only support these types, if it is not one of these then we test other
      // things and could ultimately end on a less specific placeholder
      // I don't trust spelling things :p
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
    // see if maybe they put placeholder brackets on the material
    textValue = textValue.replace("[", "").replace("]", "").trim();
    // video test
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
    // image test
    else if (
      validURL(textValue) &&
      (textValue.toLowerCase().includes(".jpg") ||
        textValue.toLowerCase().includes(".jpeg") ||
        textValue.toLowerCase().includes(".png") ||
        textValue.toLowerCase().includes(".webp"))
    ) {
      return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
    }
    // gif test
    else if (validURL(textValue) && textValue.toLowerCase().includes(".gif")) {
      return `
      <a11y-gif-player src="${textValue}" style="width: 300px;">
        <simple-img width="300" src="${textValue}"></simple-img>
      </a11y-gif-player>`;
    }
    // just use a place holder tag since we don't know or they just wanted a note
    // for a resource they don't have yet
    else {
      return `<place-holder type="text" text="${textValue}"></place-holder>`;
    }
  }
  // test for ! which implies a specific tag is going to be inserted
  // this is basically just for developers
  else if (textValue.startsWith("!") && textValue.includes("-")) {
    let tag = textValue.replace("!", "").trim();
    return `<${tag}></${tag}>`;
  }
  // allow for inline math replacement
  let content = el.outerHTML
    .replace(/\t/g, "")
    .trim()
    .replace(/\[math:(.*?)\]/g, "<lrn-math>$1</lrn-math>");
  return content;
}

// based on https://vanillajstoolkit.com/helpers/nextuntil/
async function nextUntilElement(elem, tagMatches) {
  // Setup siblings array
  const siblings = [];
  // Get the next sibling element
  elem = elem.nextElementSibling;
  // As long as a sibling exists
  while (elem) {
    // If we've reached a tag name we want to stop on, bail
    if (tagMatches.includes(elem.tagName)) {
      break;
    }
    // Otherwise, push it to the siblings array
    siblings.push(elem);
    // Get the next sibling element
    elem = elem.nextElementSibling;
  }
  return {
    siblings: siblings,
    lastEl: elem,
  };
}
