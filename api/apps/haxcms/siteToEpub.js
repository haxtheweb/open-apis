import { stdPostBody, stdResponse } from "../../utilities/requestHelpers.js";
import { JSONOutlineSchema } from "./lib/JSONOutlineSchema.js";
import { encode } from "base64-arraybuffer";
import * as fs from 'node:fs';
import * as path from 'node:path';
import url from "url";
import * as EPUB from "epub-gen-memory";

const epub = EPUB.default.default;
// site object to validate response from passed in url
export default async function handler(req, res) {
  let content = '';
  let body = {};
  if (req && req.query && req.query.url) {
    body = req.query;
  }
  else {
    body = stdPostBody(req);
  }
  // get URL bits for validating and forming calls
  const parseURL = url.parse(body.url.replace('/site.json',''));
  // verify we have a path / host
  if (parseURL.pathname && parseURL.host) {
    const base = `${parseURL.protocol}//${parseURL.host}${parseURL.pathname}`;
    const site = new JSONOutlineSchema();
    await site.load(`${base}/site.json`);
    // load all pages for their content
    const items = await pagesAsData(site);
    // make temp directory for epub
    const tempDirPath = path.join('/tmp/', 'site-to-epub-');
    await fs.mkdtempSync(tempDirPath);
    
    const options = {
      title: site.title,
      author: site.metadata.author.name || 'HAX The Web',
      publisher: "HAX The Web",
      description: site.metadata.description || '',
      cover: base + site.metadata.site.logo || '', // use logo as cover
      tocTitle: "Table of Contents",
      date: site.metadata.site.updated ? new Date(site.metadata.site.updated * 1000).toISOString() : new Date().toISOString(),
      lang: site.metadata.site.lang || 'en',
      fetchTimeout: 3000,
      ignoreFailedDownloads: true,
      tempDir: tempDirPath,
    };
    content = await epub(options, items).then(
        (contents) => {
          return contents;
        },
        err => console.error(err)
    );
    let headers = {
      disposition: `attachment; filename="${site.title}.epub"`,
      type: "application/epub+zip",
      length: content.length
    };
    if (!body.cacheBuster) {
      res = stdResponse(res, content, { cache: 86400, ...headers });
    }
    else {
      res = stdResponse(res, content, headers);  
    }
  }
}

export async function pagesAsData(site) {
  var data = [];
  // ordered
  const items = site.orderTree(site.items);
  // get every page and stuff it together
  for (var i in items) {
    let item = site.items[i];
    let content = await site.getContentById(item.id, true);
    data.push({
      title: item.title,
      content: content
    });
  }
  return data;
}