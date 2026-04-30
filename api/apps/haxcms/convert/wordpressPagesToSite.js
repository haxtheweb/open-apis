// @haxcms/wordpressPagesToSite
import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";
import { buildWordPressAdapterContext, wordpressSiteAdapters } from "./lib/wordpressSiteHelpers.js";
function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if ([ "true", "1", "yes", "on" ].includes(normalized)) {
      return true;
    }
    if ([ "false", "0", "no", "off" ].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const normalized = parseInt(value);
  if (Number.isNaN(normalized)) {
    return fallback;
  }
  return normalized;
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

  let parentId = null;
  if (body.parentId && body.parentId !== "null") {
    parentId = body.parentId;
  }
  const contentMode = body.contentMode
    ? body.contentMode
    : body.renderMode
      ? body.renderMode
      : "rendered";

  const adapterName = body.adapter ? body.adapter : "pages";
  if (!wordpressSiteAdapters[adapterName]) {
    return invalidRequest(
      res,
      `unknown adapter \`${adapterName}\`; valid adapters: ${Object.keys(wordpressSiteAdapters).join(", ")}`,
      400
    );
  }

  const context = await buildWordPressAdapterContext(body.repoUrl, {
    parentId: parentId,
    contentMode: contentMode,
    allowRawFallback: toBoolean(body.allowRawFallback, false),
    stripGutenbergComments: toBoolean(body.stripGutenbergComments, true),
    stripShortcodes: toBoolean(body.stripShortcodes, false),
    fallbackToPageHtml: toBoolean(body.fallbackToPageHtml, false),
    tokenThreshold: toNumber(body.tokenThreshold, 8)
  });
  if (context.error) {
    return invalidRequest(res, context.error, 422);
  }

  const adapterResult = await wordpressSiteAdapters[adapterName](context);
  if (adapterResult && adapterResult.error) {
    return invalidRequest(res, adapterResult.error, 422);
  }
  if (!adapterResult || !Array.isArray(adapterResult.items) || adapterResult.items.length === 0) {
    return invalidRequest(res, "WordPress import produced no pages to import", 422);
  }

  return stdResponse(
    res,
    {
      data: {
        items: adapterResult.items,
        filename: adapterResult.filename,
        files: adapterResult.files,
        wordpress: adapterResult.wordpress
      },
      status: 200
    },
    { cache: 180, type: "application/json" }
  );
}
