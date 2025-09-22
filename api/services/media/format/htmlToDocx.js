import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";
import pkg from 'html-to-docx';
const HTMLtoDOCX = pkg;

function sanitizeHtml(html) {
  // Remove any problematic elements that might cause html-to-vdom to fail
  // Clean up malformed HTML and remove any null or undefined content
  if (!html || typeof html !== 'string') {
    return '<p>Content could not be processed</p>';
  }
  
  // Remove any script tags and other potentially problematic elements
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\x00/g, '') // Remove null characters
    .trim();
  
  // Ensure we have some content
  if (!cleaned) {
    return '<p>No content available</p>';
  }
  
  return cleaned;
}

export default async function handler(req, res) {
  const body = stdPostBody(req);
  if (body === null) {
    res = invalidRequest(res, 'missing body');
  }
  else if (!body.html) {
    res = invalidRequest(res, 'missing `html` param');
  }
  else {
    try {
      // Sanitize the HTML input to prevent issues with html-to-vdom
      var html = sanitizeHtml(body.html);
      
      // Try with minimal options first to avoid issues
      const options = {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      };
      
      const docx = await HTMLtoDOCX(html, options);
      res = stdResponse(res, docx.toString('base64'), {
        cache: 180,
      });
    } catch (error) {
      console.error('HTMLtoDOCX conversion error:', error.message);
      
      // Try fallback with simplified HTML if the original fails
      try {
        const fallbackHtml = '<div><h1>Document Export</h1><p>The original document could not be fully converted. Please try exporting individual pages instead of the entire site.</p></div>';
        const docx = await HTMLtoDOCX(fallbackHtml, {
          table: { row: { cantSplit: true } }
        });
        res = stdResponse(res, docx.toString('base64'), {
          cache: 60,
        });
      } catch (fallbackError) {
        console.error('HTMLtoDOCX fallback error:', fallbackError.message);
        res = invalidRequest(res, `HTML to DOCX conversion failed: ${error.message}`);
      }
    }
  }
}
