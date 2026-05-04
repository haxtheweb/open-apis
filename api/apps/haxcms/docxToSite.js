// @haxcms/docxToSite
import { stdResponse } from "../../../utilities/requestHelpers.js";
import { JSONOutlineSchemaItem } from "../../../utilities/apps/haxcms/lib/JSONOutlineSchemaItem.js";
import { cleanTitle, validURL } from "../../../utilities/apps/haxcms/lib/JOSHelpers.js";
import df from 'mammoth';
const { convertToHtml } = df;
import { parse } from 'node-html-parser';
export default async function handler(req, res) {
  let html = '';
  let filename = null;
  // this allows mapping document styles to html tags
  const mammothOptions = {
    styleMap: [
        "u => em", // convert underline to emphasis tag
        "strike => del" // convert strike to del tag instead of s
    ]
  };
  try {
    const rawBody = await getRequestBodyBuffer(req);
    if (!rawBody || rawBody.length === 0) {
      throw new Error('No request body received');
    }
    const contentType = req.headers['content-type'] || '';
    const boundary = getMultipartBoundary(contentType);
    if (!boundary) {
      throw new Error('No boundary found in Content-Type header');
    }
    const formData = parseMultipartData(rawBody, boundary);
    if (!formData || !formData.file) {
      throw new Error('No file found in multipart data');
    }
    filename = formData.file.filename;
    if (!hasValidDocxInput(formData.file.filename, formData.file.mimeType)) {
      throw new Error(`Invalid file type. Expected .docx or .doc, got: ${formData.file.filename}`);
    }
    const type = formData.fields.type || '';
    const method = formData.fields.method || 'site';
    const parentIdField = formData.fields.parentId;
    const parentId = parentIdField && parentIdField !== 'null' ? parentIdField : null;
    try {
      html = await convertToHtml({buffer: formData.file.data}, mammothOptions)
      .then((result) => {
        return result.value; // The generated HTML
      });
    }
    catch (e) {
      html = '';
      throw new Error(`Error converting DOCX: ${e.message}`);
    }
    const doc = parse(`<div id="docx-import-wrapper">${html}</div>`);
    let items = [];
    const titleValue = getFileTitle(formData.file.filename);
    // find all the h1s, then h2, h3, h4
    //https://vanillajstoolkit.com/helpers/nextuntil/
    // while we keep selecting next siblings, and its not another at our level
    // then we keep selecting
    // so it's a select all, then a while loop, then while it's not the next
    // element selection with support for the ending ones
    let order;
    switch (method) {
      // h1 -> page, h2 -> child page, h3 -> heading, h4 -> subheading (container + page + structure import)
      case 'site':
        let h1s = doc.querySelectorAll('h1');
        let h1Order = 0;
        // if we have no headings, then we need to treat as a single page
        if (h1s.length === 0) {
          items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector('#docx-import-wrapper')), parentId));
        }
        else {
          for await (const h1 of h1s) {
            let item = new JSONOutlineSchemaItem();
            item.title = h1.innerText.trim().replace('  ', ' ').replace('  ', ' ');
            item.slug = cleanTitle(item.title);
            item.order = h1Order;
            item.parent = parentId; // null default, supports importing deep structure under a parent though
            h1Order += 1;
            let tmp = await nextUntilElement(h1, ['H1']);
            let h1Children = tmp.siblings;
            let contents = '';
            let h2 = null;
            for await (const h1Child of h1Children) {
              if (h1Child.tagName === 'H2') {
                // implies we need to drill down bc we have nested pages
                h2 = h1Child;
                break;
              }
              else if (h2 === null) {
                contents += htmlFromEl(h1Child);
              }
            }
            // if empty, make it a blank p so it has at least something
            item.contents = contents !== '' ? contents : getFallbackContent(type);
            items.push(item);
            // we found an h2 under an h1, associate down more
            if (h2) {
              let h2Order = 0;
              while (h2 !== null && h2.tagName === 'H2') {
                let item2 = new JSONOutlineSchemaItem();
                item2.title = h2.innerText.trim().replace('  ', ' ').replace('  ', ' ');
                item2.slug = item.slug + '/' + cleanTitle(item2.title);
                item2.order = h2Order;
                h2Order += 1;
                item2.indent = 1;
                // this page's parent is the prev item
                item2.parent = item.id;
                // get next h2, or run out at an h1
                let tmp = await nextUntilElement(h2, ['H1','H2']);
                let h2Children = tmp.siblings;
                h2 = tmp.lastEl;
                let contents2 = '';
                for await (const h2Child of h2Children) {
                  contents2 += htmlFromEl(h2Child);
                }
                item2.contents = contents2 !== '' ? contents2 : '<p></p>';
                items.push(item2);
              }
            }
          }
        }
      break;
      // h1 -> page, h2 -> heading, h3 -> subheading, h4 -> sub-subheading (flat page structure import, file name === container)
      case 'branch':
        let els = doc.querySelectorAll('h1');
        order = 0;
        // if we have no headings, then we need to treat as a single page
        if (els.length === 0) {
          items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector('#docx-import-wrapper')), parentId));
        }
        else {
          for await (const h1 of els) {
            let item = new JSONOutlineSchemaItem();
            item.title = h1.innerText.trim().replace('  ', ' ').replace('  ', ' ');
            item.slug = cleanTitle(item.title);
            item.order = order;
            item.parent = parentId; // null default, supports importing structure under a parent though
            order += 1;
            let tmp = await nextUntilElement(h1, ['H1']);
            let h1Children = tmp.siblings;
            let contents = '';
            for await (const h1Child of h1Children) {
              contents += htmlFromEl(h1Child);
            }
            // if empty, make it a blank p so it has at least something
            item.contents = contents !== '' ? contents : getFallbackContent(type);
            items.push(item);
          }
        }
      break;
      // h1 -> heading, h2 -> subheading, h3 -> sub-subheading, h4 -> sub-sub-subheading (single page import)
      case 'page':
      default:
        items.push(importSinglePage(titleValue, processSinglePageContent(doc.querySelector('#docx-import-wrapper')), parentId));
      break;
    }
    res = stdResponse(res, {
      items: items,
      filename: formData.file.filename,
    });
  }
  catch (error) {
    console.error('docxToSite: Error processing file:', error.message);
    res = stdResponse(
      res,
      {
        error: `Error processing DOCX import: ${error.message}`,
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
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
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
  const data = buffer.toString('binary');
  const parts = data.split('--' + boundary);
  const result = {
    fields: {},
    file: null,
  };
  for (const part of parts) {
    if (!part || part === '--' || part === '--\r\n' || part === '\r\n') {
      continue;
    }
    const headerEndIndex = part.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
      continue;
    }
    const headerText = part.substring(0, headerEndIndex);
    if (!headerText.includes('Content-Disposition: form-data')) {
      continue;
    }
    const nameMatch = headerText.match(/name=\"([^\"]+)\"/);
    if (!nameMatch || !nameMatch[1]) {
      continue;
    }
    let partData = part.substring(headerEndIndex + 4);
    partData = partData.replace(/\r\n$/, '');
    const filenameMatch = headerText.match(/filename=\"([^\"]+)\"/);
    if (filenameMatch && filenameMatch[1]) {
      const mimeTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
      result.file = {
        fieldName: nameMatch[1],
        filename: filenameMatch[1],
        mimeType: mimeTypeMatch && mimeTypeMatch[1] ? mimeTypeMatch[1].trim() : null,
        data: Buffer.from(partData, 'binary'),
      };
    }
    else {
      result.fields[nameMatch[1]] = partData;
    }
  }
  return result;
}

function hasValidDocxInput(filename, mimeType) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  const validMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/octet-stream',
  ];
  return /\.(docx|doc)$/i.test(filename) && (!mimeType || validMimeTypes.includes(mimeType));
}

function getFileTitle(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'new page';
  }
  return filename.replace(/\.(docx|doc)$/i, '');
}

function processSinglePageContent(wrapperEl) {
  if (!wrapperEl) {
    return '<p></p>';
  }
  let content = '';
  for (const child of wrapperEl.childNodes) {
    if (child && child.tagName) {
      content += htmlFromEl(child);
    }
  }
  return content !== '' ? content : wrapperEl.innerHTML;
}

function importSinglePage(title, content, pValue) {
  let item = new JSONOutlineSchemaItem();
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
  if (validURL(textValue) && (
    textValue.includes('youtube.com') ||
    textValue.includes('youtu.be') ||
    textValue.includes('youtube-nocookie.com') ||
    textValue.includes('vimeo.com') ||
    textValue.toLowerCase().includes('.mp4')
    )
  ) {
    return `<video-player source="${textValue}"></video-player>`;
  }
  // image
  else if (validURL(textValue) && (
    textValue.toLowerCase().includes('.jpg') ||
    textValue.toLowerCase().includes('.jpeg') ||
    textValue.toLowerCase().includes('.png') ||
    textValue.toLowerCase().includes('.webp')
    )
  ) {
    return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
  }
  // gif
  else if (validURL(textValue) && textValue.toLowerCase().includes('.gif')) {
    return `
    <a11y-gif-player src="${textValue}" style="width: 300px;">
      <simple-img width="300" src="${textValue}"></simple-img>
    </a11y-gif-player>`;
  }
  // test for a common convention for a place holder
  else if (textValue.startsWith('[') && textValue.endsWith(']')) {
    let tmp = textValue.split(':');
    // test for a type definition vs just rendering a basic textual one
    if (tmp.length > 1) {
      let type = tmp.shift().replace('[','');
      let text = tmp.join(':').replace(']','').trim();
      // we only support these types, if it is not one of these then we test other
      // things and could ultimately end on a less specific placeholder
      // I don't trust spelling things :p
      switch(type) {
        case 'math':
        case 'mathjax':
          return `<lrn-math>${text}</lrn-math>`;
        break;
        case 'video':
        case 'audio':
        case 'document':
        case 'text':
        case 'image':
          return `<place-holder type="${type}" text="${text}"></place-holder>`;
        break;
      }
    }
    // see if maybe they put placeholder brackets on the material
    textValue = textValue.replace('[','').replace(']','').trim();
    // video test
    if (validURL(textValue) && (
      textValue.includes('youtube.com') ||
      textValue.includes('youtu.be') ||
      textValue.includes('youtube-nocookie.com') ||
      textValue.includes('vimeo.com') ||
      textValue.includes('twitch.tv') ||
      textValue.toLowerCase().includes('.mp4')
      )
    ) {
      return `<video-player source="${textValue}"></video-player>`;
    }
    // image test
    else if (validURL(textValue) && (
      textValue.toLowerCase().includes('.jpg') ||
      textValue.toLowerCase().includes('.jpeg') ||
      textValue.toLowerCase().includes('.png') ||
      textValue.toLowerCase().includes('.webp')
      )
    ) {
      return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
    }
    // gif test
    else if (validURL(textValue) && textValue.toLowerCase().includes('.gif')) {
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
  else if (textValue.startsWith('!') && textValue.includes('-')) {
    let tag = textValue.replace('!', '').trim();
    return `<${tag}></${tag}>`;
  }
  // allow for inline math replacement
  let content = el.outerHTML.replace(/\t/g, '').trim().replace(/\[math:(.*?)\]/g,'<lrn-math>$1</lrn-math>');
  return content;
}

// based on https://vanillajstoolkit.com/helpers/nextuntil/
async function nextUntilElement(elem, tagMatches) {
	// Setup siblings array
	var siblings = [];
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
  }
};

function getFallbackContent(type) {
  switch (type) {
    case 'portfolio':
      return `<p>Enjoy my portfolio and let me know if you have questions.</p>
<lesson-overview>
  <lesson-highlight smart="pages"></lesson-highlight>
</lesson-overview>`;
    break;
    case 'course':
    return `<p>Welcome to the lesson.</p>
<lesson-overview>
  <lesson-highlight smart="pages"></lesson-highlight>
  <lesson-highlight smart="readTime"></lesson-highlight>
  <lesson-highlight smart="selfChecks"></lesson-highlight>
  <lesson-highlight smart="audio"></lesson-highlight>
  <lesson-highlight smart="video"></lesson-highlight>
</lesson-overview>
<p>Let's begin!</p>`;
    break;
    default:
      return '<p></p>';
    break;
  }
}