import { stdPostBody, stdResponse } from "../../_utilities/requestHelpers.js";
import { courseStatsFromOutline } from "../../_utilities/apps/haxcms/lib/JOSHelpers.js";

// report videos that do not appear to include transcript or caption tracks
export default async function handler(req, res) {
  let data = {};
  let body = {};
  if (req && req.query && req.query.site) {
    body = req.query;
  }
  else {
    body = stdPostBody(req);
  }
  if (body.site && body.type) {
    let url = '';
    if (body.type === 'link') {
      url = body.site.replace('/site.json', '');
    }
    else {
      body.site.file = body.site.file.replace('iam.', 'oer.').replace('courses.', 'oer.');
      url = body.site.file.replace('/site.json', '');
    }
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    const parseURL = new URL(url);
    if (parseURL.pathname && parseURL.host) {
      parseURL.host = parseURL.host.replace('iam.', 'oer.').replace('courses.', 'oer.');
      const base = `${parseURL.protocol}//${parseURL.host}${parseURL.pathname}`;
      let siteData = body.site || null;
      let itemId = body.activeId || null;
      if (itemId === 'null') {
        itemId = null;
      }
      if (body.type === 'link') {
        siteData = null;
      }
      data = await courseStatsFromOutline(base, siteData, itemId, ['videoTranscriptData']);
    }
  }
  res = stdResponse(res, data);
}
