import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";

import * as yaml from 'js-yaml';

export default async function handler(req, res) {
  let body = null;
  
  if (req.method === 'POST') {
    // Try standard approach first
    body = stdPostBody(req);
    
    // Handle different Vercel body formats
    if (body === null && req.body) {
      try {
        if (typeof req.body === 'string') {
          body = JSON.parse(req.body);
        } else if (req.body && typeof req.body === 'object') {
          body = req.body;
        }
      } catch (e) {
        body = null;
      }
    }
  }
  
  if (body === null) {
    res = invalidRequest(res, 'missing body');
  }
  else if (!body.json) {
    res = invalidRequest(res, 'missing `json` param');
  }
  else {
    var jsonData = body.json;
    
    // json is actually a link reference so fetch it first
    if (body.type === 'link' && jsonData) {
      try {
        jsonData = await fetch(jsonData.trim()).then((d) => d.ok ? d.text() : '');
        // Parse the fetched JSON string
        jsonData = JSON.parse(jsonData);
      } catch (error) {
        res = invalidRequest(res, 'Failed to fetch or parse JSON from link');
        return;
      }
    }
    
    // Ensure jsonData is valid JSON
    if (typeof jsonData === 'string') {
      try {
        jsonData = JSON.parse(jsonData);
      } catch (error) {
        res = invalidRequest(res, 'Invalid JSON string provided');
        return;
      }
    }
    
    if (jsonData === null || jsonData === undefined) {
      res = invalidRequest(res, 'Invalid JSON content format');
      return;
    }
    
    try {
      const yamlOutput = yaml.dump(jsonData);
      stdResponse(res, yamlOutput, {cache: 180});
    } catch (error) {
      res = invalidRequest(res, 'Failed to convert JSON to YAML: ' + error.message);
    }
  }
}