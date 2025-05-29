import { stdPostBody, stdResponse } from "../../utilities/requestHelpers.js";
import { resolveSiteData } from "./lib/JOSHelpers.js";
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as EPUB from "epub-gen-memory";

const epub = EPUB.default.default;
// site object to validate response from passed in url
export default async function handler(req, res) {
  let content = '';
  let body = {};
  if (req && req.query && req.query.site) {
    body = req.query;
  }
  else {
    body = stdPostBody(req);
  }
  // get URL bits for validating and forming calls
  let url = '';
  if (body.type === 'link') {
    url = body.site.replace('/site.json', '');
  }
  else {
    body.site.file = body.site.file.replace('iam.', 'oer.');
    // abuse that we have this prop for where somerthing lives
    url = body.site.file.replace('/site.json', '');
  }
  // handle trailing slash
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  var parseURL = new URL(url);
  // verify we have a path / host
  if (parseURL.pathname && parseURL.host) {
    // support for iam vs oer
    if (parseURL.host) {
      // specific to our instances but iam is going to block access when querying for the site content
      // iam is the authoring domain while oer is the openly available one which if printing
      // and rendering the content appropriately, this is the way to do it
      parseURL.host = parseURL.host.replace('iam.', 'oer.');
    }
    const base = `${parseURL.protocol}//${parseURL.host}${parseURL.pathname}`;
    var siteData = body.site || null;
    const ancestor = body.ancestor || null;
    if (body.type === 'link') {
      siteData = null;
    }
    const site = await resolveSiteData(base, siteData);
    // load all pages for their content
    const items = await pagesAsData(site, ancestor, base);
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
      css: `
      body { background: #000; }
      .container {
        position: relative;
        overflow: hidden;
        width: 100%;
        padding-top: 56.25%;
      }

      iframe {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        width: 100%;
        height: 100%;
      }
      `,
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

export async function pagesAsData(site, ancestor, url) {
  var data = [];
  let items = [];
  // ordered by ancestor if provided
  if (ancestor != null) {
    items = await site.findBranch(ancestor).filter(function(el) {
      if (el && el.metadata && el.metadata.published) {
        return true;
      }
      return false;
    });
  }
  else {
    items = await site.orderTree(site.items).filter(function(el) {
      if (el && el.metadata && el.metadata.published === false) {
        return false;
      }
      return true;
    });
  }
  // get every page and stuff it together
  for (var i in items) {
    let item = site.items[i];
    let content = await site.getContentById(item.id, true);
    /*
    // this would hydrate the web components with scoped CSS definitions but is experimental
    let response = await fetch(`https://webcomponents.hax.cloud/api/hydrateSsr`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'html',
          q: content,
        }),
      }
    ).then((d) => d.ok ? d.text() : false);
    */
    data.push({
      title: item.title,
      content: content,
      url: url + item.slug,
    });
  }
  return data;
}