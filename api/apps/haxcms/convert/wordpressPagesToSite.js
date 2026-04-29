// @haxcms/wordpressPagesToSite
import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";
import { buildWordPressAdapterContext, wordpressSiteAdapters } from "./lib/wordpressSiteHelpers.js";

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

  const adapterName = body.adapter ? body.adapter : "pages";
  if (!wordpressSiteAdapters[adapterName]) {
    return invalidRequest(
      res,
      `unknown adapter \`${adapterName}\`; valid adapters: ${Object.keys(wordpressSiteAdapters).join(", ")}`,
      400
    );
  }

  const context = await buildWordPressAdapterContext(body.repoUrl, {
    parentId: parentId
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
