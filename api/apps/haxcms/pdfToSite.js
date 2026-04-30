// @haxcms/pdfToSite
import { stdResponse } from "../../utilities/requestHelpers.js";
import { JSONOutlineSchemaItem } from "./lib/JSONOutlineSchemaItem.js";
import { cleanTitle, validURL } from "./lib/JOSHelpers.js";
import { convertPdfBufferToHtml } from "./lib/pdfToSemanticHtml.js";
import busboy from "busboy";
import concat from "concat-stream";
import { parse } from "node-html-parser";

export default async function handler(req, res) {
  let html = "";
  const buffer = {
    filename: null,
    data: null,
  };
  let type = "";
  let method = "site";
  let parentId = null;

  const bb = busboy({ headers: req.headers });
  bb.on("field", async (name, fieldValue, info) => {
    if (name === "method") {
      method = fieldValue;
    }
    else if (name === "type") {
      type = fieldValue;
    }
    else if (name === "parentId" && fieldValue !== "null") {
      parentId = fieldValue;
    }
  });

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
    if (buffer.data) {
      try {
        html = await convertPdfBufferToHtml(buffer.data);
      }
      catch (e) {
        html = "";
      }
    }

    const doc = parse(`<div id="pdf-import-wrapper">${html}</div>`);
    const items = [];
    const titleValue = getFileTitle(buffer.filename);
    let order;
    switch (method) {
      case "site":
        const h1s = doc.querySelectorAll("h1");
        let h1Order = 0;
        if (h1s.length === 0) {
          items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector("#pdf-import-wrapper")), parentId));
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
          items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector("#pdf-import-wrapper")), parentId));
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
        items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector("#pdf-import-wrapper")), parentId));
      break;
    }

    res = stdResponse(res, {
      items: items,
      filename: buffer.filename,
    });
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

function getFileTitle(filename) {
  if (!filename || typeof filename !== "string") {
    return "new page";
  }
  return filename.replace(/\.pdf$/i, "");
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
