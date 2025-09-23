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
  else if (!body.yaml) {
    res = invalidRequest(res, 'missing `yaml` param');
  }
  else {
    var yamlData = body.yaml;
    
    // yaml is actually a link reference so fetch it first
    if (body.type === 'link' && yamlData) {
      try {
        yamlData = await fetch(yamlData.trim()).then((d) => d.ok ? d.text() : '');
        // yamlData is now the fetched YAML string
      } catch (error) {
        res = invalidRequest(res, 'Failed to fetch YAML from link');
        return;
      }
    }
    
    // Ensure yamlData is a string
    if (typeof yamlData !== 'string') {
      res = invalidRequest(res, 'YAML input must be a string');
      return;
    }
    
    if (yamlData === null || yamlData === undefined || yamlData.trim() === '') {
      res = invalidRequest(res, 'Invalid or empty YAML content');
      return;
    }
    
    try {
      const jsonOutput = yaml.load(yamlData);
      
      // Convert to JSON string with proper formatting
      const jsonString = JSON.stringify(jsonOutput, null, 2);
      
      stdResponse(res, jsonString, {cache: 180});
    } catch (error) {
      res = invalidRequest(res, 'Failed to convert YAML to JSON: ' + error.message);
    }
  }
}