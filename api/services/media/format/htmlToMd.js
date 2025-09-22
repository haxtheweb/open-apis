import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";

import * as df from 'turndown';
const TurndownService = df.default;
var turndownService = new TurndownService();

export default async function handler(req, res) {
  const body = stdPostBody(req);
  if (body === null) {
    res = invalidRequest(res, 'missing body');
  }
  else if (!body.html) {
    res = invalidRequest(res, 'missing `html` param');
  }
  else {
    var html = body.html;
    // md is actually a link reference so fetch it 1st
    if (body.type === 'link' && html) {
      try {
        html = await fetch(html.trim()).then((d) => d.ok ? d.text(): '');
      } catch (error) {
        html = '';
      }
    }
    
    // Ensure html is a string before passing to turndown
    if (typeof html !== 'string') {
      if (html === null || html === undefined) {
        html = '';
      } else if (typeof html === 'object') {
        // If it's an object, try to extract meaningful content
        if (html.html) {
          html = html.html;
        } else if (html.content) {
          html = html.content;
        } else if (html.data) {
          html = html.data;
        } else {
          res = invalidRequest(res, 'Invalid HTML content format');
          return;
        }
      } else {
        html = String(html);
      }
    }
    
    try {
      const markdown = turndownService.turndown(html);
      stdResponse(res, markdown, {cache: 180 });
    } catch (error) {
      res = invalidRequest(res, 'Failed to convert HTML to Markdown');
    }
  }
}