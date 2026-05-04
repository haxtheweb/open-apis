// docxToHtml
import { stdResponse } from "../../../../utilities/requestHelpers.js";
import df from 'mammoth';
const { convertToHtml } = df;
import { parse } from 'node-html-parser';
import { validURL } from '../../../../utilities/apps/haxcms/lib/JOSHelpers.js';
import { stripMSWord } from '../../../../utilities/htmlScrubbers.js';

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
  // this allows mapping document styles to html tags
  var mammothOptions = {
    styleMap: [
        "u => em", // convert underline to emphasis tag
        "strike => del" // convert strike to del tag instead of s
    ]
  };

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
      const validExtensions = ['.docx', '.doc'];
      const hasValidExtension = validExtensions.some(ext => 
        fileInfo.filename.toLowerCase().endsWith(ext)
      );
      
      if (!hasValidExtension) {
        throw new Error(`Invalid file type. Expected .docx or .doc, got: ${fileInfo.filename}`);
      }
      
      let html = '';
      
      // Process DOCX file with mammoth
      try {
        html = await convertToHtml({buffer: fileInfo.data}, mammothOptions)
          .then((result) => {
            return result.value; // The generated HTML
          });
        html = processDocxHtml(html);
        html = stripMSWord(html);
      } catch (e) {
        // put in the output
        html = `Error converting document: ${e.message}`;
      }
      
      res = stdResponse(res, {
        contents: html,
        filename: fileInfo.filename,
      });
      
    } catch (error) {
      console.error('docxToHtml: Error processing file:', error.message);
      res = stdResponse(res, {
        error: `Error processing Word document: ${error.message}`,
        contents: '',
        filename: null
      }, { status: 400 });
    }
  });
  
  req.on('error', (err) => {
    console.error('docxToHtml: Request error:', err.message);
    res = stdResponse(res, { error: err.message }, { status: 500 });
  });
}
function processDocxHtml(html) {
  const doc = parse(`<div id="docx-import-wrapper">${html}</div>`);
  const wrapper = doc.querySelector('#docx-import-wrapper');
  if (!wrapper) {
    return html;
  }
  let content = '';
  for (const child of wrapper.childNodes) {
    if (child && child.tagName) {
      content += htmlFromEl(child);
    }
  }
  return content !== '' ? content : html;
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
