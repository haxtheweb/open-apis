// @haxcms/drupalBookToSite
import { stdPostBody, stdResponse, invalidRequest } from "../../../_utilities/requestHelpers.js";
import { importDrupalBookSite } from "../../../_utilities/apps/haxcms/convert/lib/drupalSiteHelpers.js";

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export default async function handler(req, res) {
  let body = {};
  if (req && req.query && req.query.repoUrl) {
    body = req.query;
  }
  else if (req && req.body && typeof req.body === "object") {
    body = req.body;
  }
  else {
    body = stdPostBody(req);
  }
  if (!body || !body.repoUrl) {
    return invalidRequest(res, "missing `repoUrl` param");
  }

  const settings = {};
  if (body.parentId && body.parentId !== "null") {
    settings.parentId = body.parentId;
  }
  if (normalizeBoolean(body.allowHtmlFallback)) {
    settings.allowHtmlFallback = true;
  }

  const importedData = await importDrupalBookSite(body.repoUrl, settings);
  if (!importedData) {
    return invalidRequest(res, "Drupal import failed to produce content", 422);
  }
  if (importedData.error) {
    return invalidRequest(res, importedData.error, 422);
  }
  if (!Array.isArray(importedData.items) || importedData.items.length === 0) {
    return invalidRequest(res, "Drupal import produced no pages to import", 422);
  }

  return stdResponse(
    res,
    {
      data: {
        items: importedData.items,
        filename: importedData.filename,
        files: importedData.files,
        drupal: importedData.drupal
      },
      status: 200
    },
    { cache: 180, type: "application/json" }
  );
}
