// @haxcms/pressbooksToSite
import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";
import { JSONOutlineSchemaItem } from "../lib/JSONOutlineSchemaItem.js";
import { cleanTitle, validURL } from "../lib/JOSHelpers.js";
import busboy from "busboy";
import concat from "concat-stream";
import { parse } from "node-html-parser";
import { discoverPressbooksBase, fetchJSON, absolutizeRootUrls } from "./lib/wordpressSiteHelpers.js";
const SUPPORTED_SITE_LICENSES = [
  "by-nc-nd",
  "by-nc-sa",
  "by-nc",
  "by-nd",
  "by-sa",
  "by"
];

export default async function handler(req, res) {
  const contentType =
    req && req.headers && req.headers["content-type"]
      ? req.headers["content-type"]
      : "";
  if (contentType.indexOf("multipart/form-data") !== -1) {
    return handleHtmlFileImport(req, res);
  }

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

  const discoveredBase = await discoverPressbooksBase(body.repoUrl);
  if (!discoveredBase) {
    return invalidRequest(
      res,
      "Unable to discover Pressbooks API from `repoUrl`; expected `/wp-json/pressbooks/v2/*`",
      422
    );
  }

  const importedData = await importPressbooksSite(discoveredBase, parentId);
  if (!importedData) {
    return invalidRequest(
      res,
      "Pressbooks API discovered but import failed to produce content",
      422
    );
  }

  const responseData = {
    items: importedData.items,
    filename: importedData.filename,
    files: importedData.files
  };
  if (importedData.site && typeof importedData.site === "object") {
    responseData.site = importedData.site;
  }
  return stdResponse(
    res,
    {
      data: responseData,
      status: 200
    },
    { cache: 180, type: "application/json" }
  );
}

async function handleHtmlFileImport(req, res) {
  return new Promise((resolve) => {
    let html = "";
    const buffer = {
      filename: null,
      data: null
    };
    let type = "";
    let method = "site";
    let parentId = null;
    const bb = busboy({ headers: req.headers });
    bb.on("field", async (name, fieldValue) => {
      if (name === "method") {
        method = fieldValue;
      }
      else if (name === "type") {
        type = fieldValue;
      }
      else if (name === "parentId" && fieldValue !== "null") {
        parentId = fieldValue;
      }
    });
    bb.on("file", async (name, file, info) => {
      const { filename, mimeType } = info;
      if (filename.length > 0 && ["text/html"].includes(mimeType)) {
        file.pipe(
          concat((fileBuffer) => {
            buffer.filename = filename;
            buffer.data = fileBuffer;
          })
        );
      }
    });
    bb.on("close", async () => {
      if (buffer.data) {
        try {
          html = buffer.data.toString();
        }
        catch (e) {
          html = "";
        }
      }
      const doc = parse(`<div id="import-wrapper">${html}</div>`);
      const items = await convertHtmlDocumentToItems(
        doc,
        method,
        type,
        parentId,
        buffer.filename
      );
      resolve(
        stdResponse(res, {
          items: items,
          filename: buffer.filename
        })
      );
    });
    req.pipe(bb);
  });
}

async function importPressbooksSite(base, parentId = null) {
  const toc = await fetchJSON(`${base}/wp-json/pressbooks/v2/toc`);
  if (
    !toc ||
    !Array.isArray(toc["front-matter"]) ||
    !Array.isArray(toc.parts) ||
    !Array.isArray(toc["back-matter"])
  ) {
    return null;
  }
  const siteMetadata = await fetchJSON(`${base}/wp-json/pressbooks/v2/metadata`);
  const normalizedSiteMetadata = getPressbooksSiteMetadata(siteMetadata);
  const topLevelOrder = {
    value: 0
  };
  const items = [];

  const frontMatterItems = await buildTopLevelSectionItems(
    base,
    toc["front-matter"],
    "front-matter",
    parentId,
    topLevelOrder
  );
  items.push(...frontMatterItems);

  const partItems = await buildPartAndChapterItems(
    base,
    toc.parts,
    parentId,
    topLevelOrder
  );
  items.push(...partItems);

  const backMatterItems = await buildTopLevelSectionItems(
    base,
    toc["back-matter"],
    "back-matter",
    parentId,
    topLevelOrder
  );
  items.push(...backMatterItems);

  const importedSite = {
    items,
    files: {},
    filename: getSiteFilename(siteMetadata, base)
  };
  if (Object.keys(normalizedSiteMetadata).length > 0) {
    importedSite.site = normalizedSiteMetadata;
  }
  return importedSite;
}

async function buildTopLevelSectionItems(base, sectionItems, endpointType, parentId, orderRef) {
  const items = [];
  for await (const section of sortPressbooksItems(sectionItems)) {
    if (section && section.export === false) {
      continue;
    }
    const fullData = await fetchPressbooksEntity(base, endpointType, section.id);
    const item = new JSONOutlineSchemaItem();
    item.title = getPressbooksItemTitle(section, fullData);
    item.slug = cleanTitle(item.title);
    item.order = orderRef.value;
    orderRef.value += 1;
    item.parent = parentId;
    item.contents = getPressbooksItemContent(fullData, section, base);
    item.metadata = getPressbooksMetadata(section, fullData, endpointType);
    items.push(item);
  }
  return items;
}

async function buildPartAndChapterItems(base, parts, parentId, orderRef) {
  const items = [];
  for await (const part of sortPressbooksItems(parts)) {
    if (part && part.export === false) {
      continue;
    }
    const partData = await fetchPressbooksEntity(base, "parts", part.id);
    const partItem = new JSONOutlineSchemaItem();
    partItem.title = getPressbooksItemTitle(part, partData);
    partItem.slug = cleanTitle(partItem.title);
    partItem.order = orderRef.value;
    orderRef.value += 1;
    partItem.parent = parentId;
    partItem.contents = getPressbooksItemContent(partData, part, base);
    partItem.metadata = getPressbooksMetadata(part, partData, "part");
    items.push(partItem);

    if (part && Array.isArray(part.chapters)) {
      let chapterOrder = 0;
      for await (const chapter of sortPressbooksItems(part.chapters)) {
        if (chapter && chapter.export === false) {
          continue;
        }
        const chapterData = await fetchPressbooksEntity(base, "chapters", chapter.id);
        const chapterItem = new JSONOutlineSchemaItem();
        chapterItem.title = getPressbooksItemTitle(chapter, chapterData);
        chapterItem.slug = `${partItem.slug}/${cleanTitle(chapterItem.title)}`;
        chapterItem.order = chapterOrder;
        chapterOrder += 1;
        chapterItem.indent = 1;
        chapterItem.parent = partItem.id;
        chapterItem.contents = getPressbooksItemContent(chapterData, chapter, base);
        chapterItem.metadata = getPressbooksMetadata(chapter, chapterData, "chapter");
        items.push(chapterItem);
      }
    }
  }
  return items;
}

async function fetchPressbooksEntity(base, endpointType, id) {
  if (!id) {
    return null;
  }
  return fetchJSON(`${base}/wp-json/pressbooks/v2/${endpointType}/${id}`);
}

function sortPressbooksItems(items) {
  const sorted = Array.isArray(items) ? [...items] : [];
  sorted.sort((a, b) => {
    const aOrder = a && a.menu_order !== undefined ? parseInt(a.menu_order) : 0;
    const bOrder = b && b.menu_order !== undefined ? parseInt(b.menu_order) : 0;
    return aOrder - bOrder;
  });
  return sorted;
}

function getPressbooksItemTitle(item, fullData) {
  let title = "";
  if (fullData && fullData.title) {
    if (typeof fullData.title === "string") {
      title = fullData.title;
    }
    else if (fullData.title.rendered) {
      title = fullData.title.rendered;
    }
    else if (fullData.title.raw) {
      title = fullData.title.raw;
    }
  }
  if (title === "" && item && item.title) {
    if (typeof item.title === "string") {
      title = item.title;
    }
    else if (item.title.rendered) {
      title = item.title.rendered;
    }
    else if (item.title.raw) {
      title = item.title.raw;
    }
  }
  if (title === "" && item && item.slug) {
    title = item.slug;
  }
  return parse(`<div>${title}</div>`).innerText.trim();
}

function getPressbooksItemContent(fullData, fallbackItem, base) {
  let content = "";
  if (fullData && fullData.content) {
    if (typeof fullData.content === "string") {
      content = fullData.content;
    }
    else if (fullData.content.rendered) {
      content = fullData.content.rendered;
    }
    else if (fullData.content.raw) {
      content = fullData.content.raw;
    }
  }
  if (content === "") {
    if (fallbackItem && fallbackItem.has_post_content) {
      return "<p></p>";
    }
    return "<p></p>";
  }
  return absolutizeRootUrls(content, base);
}


function getPressbooksMetadata(item, fullData, sourceType) {
  const metadata = {
    sourceType: sourceType,
    pressbooks: {}
  };
  const source = fullData && fullData.link ? fullData.link : item && item.link ? item.link : null;
  if (source) {
    metadata.source = source;
  }
  const id = fullData && fullData.id ? fullData.id : item && item.id ? item.id : null;
  if (id) {
    metadata.pressbooks.id = id;
  }
  if (item && item.slug) {
    metadata.pressbooks.slug = item.slug;
  }
  if (item && item.menu_order !== undefined) {
    metadata.pressbooks.menuOrder = item.menu_order;
  }
  if (item && item.status) {
    metadata.pressbooks.status = item.status;
  }
  return metadata;
}

function getSiteFilename(siteMetadata, base) {
  if (siteMetadata && siteMetadata.name) {
    return cleanTitle(siteMetadata.name);
  }
  let pathname = "";
  try {
    pathname = new URL(base).pathname;
  }
  catch (e) {
    pathname = "";
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 0) {
    return cleanTitle(parts[parts.length - 1]);
  }
  return "pressbooks-import";
}

function normalizeSiteLicenseValue(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return null;
  }
  const value = rawValue
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (value === "") {
    return null;
  }
  if (SUPPORTED_SITE_LICENSES.includes(value)) {
    return value;
  }
  for (const code of SUPPORTED_SITE_LICENSES) {
    if (
      value.indexOf(`/licenses/${code}`) !== -1 ||
      value.indexOf(`cc ${code}`) !== -1 ||
      value.indexOf(`cc-${code}`) !== -1 ||
      value.indexOf(`cc:${code}`) !== -1
    ) {
      return code;
    }
  }
  const compactValue = value.replace(/[^a-z]/g, "");
  const hasNonCommercial = compactValue.indexOf("noncommercial") !== -1;
  const hasNoDerivatives = compactValue.indexOf("noderivatives") !== -1;
  const hasShareAlike = compactValue.indexOf("sharealike") !== -1;
  const hasAttribution =
    compactValue.indexOf("attribution") !== -1 ||
    value.indexOf("/licenses/by/") !== -1 ||
    value.indexOf("cc by") !== -1;
  if (hasNonCommercial && hasNoDerivatives) {
    return "by-nc-nd";
  }
  if (hasNonCommercial && hasShareAlike) {
    return "by-nc-sa";
  }
  if (hasNonCommercial) {
    return "by-nc";
  }
  if (hasNoDerivatives) {
    return "by-nd";
  }
  if (hasShareAlike) {
    return "by-sa";
  }
  if (hasAttribution) {
    return "by";
  }
  return null;
}

function collectLicenseCandidatesFromMetadata(metadata, candidates = []) {
  if (!metadata || typeof metadata !== "object") {
    return candidates;
  }
  if (Array.isArray(metadata)) {
    for (const item of metadata) {
      collectLicenseCandidatesFromMetadata(item, candidates);
    }
    return candidates;
  }
  for (const key of Object.keys(metadata)) {
    const value = metadata[key];
    const normalizedKey = key.toLowerCase();
    if (typeof value === "string") {
      if (
        normalizedKey.indexOf("license") !== -1 ||
        normalizedKey.indexOf("rights") !== -1 ||
        normalizedKey.indexOf("copyright") !== -1
      ) {
        candidates.push(value);
      }
    }
    else if (value && typeof value === "object") {
      collectLicenseCandidatesFromMetadata(value, candidates);
    }
  }
  return candidates;
}

function getPressbooksSiteMetadata(siteMetadata) {
  const metadata = {};
  const licenseCandidates = collectLicenseCandidatesFromMetadata(siteMetadata);
  for (const candidate of licenseCandidates) {
    const normalizedLicense = normalizeSiteLicenseValue(candidate);
    if (normalizedLicense) {
      metadata.license = normalizedLicense;
      break;
    }
  }
  return metadata;
}


async function convertHtmlDocumentToItems(doc, method, type, parentId, filename) {
  const items = [];
  let order;
  switch (method) {
    case "site":
      let h1s = doc.querySelectorAll("h1");
      order = 0;
      for await (const h1 of h1s) {
        let item = new JSONOutlineSchemaItem();
        item.title = h1.innerText.trim().replace("  ", " ").replace("  ", " ");
        item.slug = cleanTitle(item.title);
        item.order = order;
        item.parent = parentId;
        order += 1;
        let tmp = await nextUntilElement(h1, ["H1"]);
        let h1Children = tmp.siblings;
        let contents = "";
        let h2 = null;
        for await (const h1Child of h1Children) {
          if (h1Child.tagName === "H2") {
            h2 = h1Child;
            break;
          }
          else if (h2 === null) {
            contents += htmlFromEl(h1Child);
          }
        }
        item.contents = contents !== "" ? contents : getFallbackContent(type);
        items.push(item);
        if (h2) {
          order = 0;
          while (h2 !== null && h2.tagName === "H2") {
            let item2 = new JSONOutlineSchemaItem();
            item2.title = h2.innerText.trim().replace("  ", " ").replace("  ", " ");
            item2.slug = item.slug + "/" + cleanTitle(item2.title);
            item2.order = order;
            order += 1;
            item2.indent = 1;
            item2.parent = item.id;
            let tmp = await nextUntilElement(h2, ["H1", "H2"]);
            let h2Children = tmp.siblings;
            h2 = tmp.lastEl;
            let contents2 = "";
            for await (const h2Child of h2Children) {
              contents2 += htmlFromEl(h2Child);
            }
            item2.contents = contents2 !== "" ? contents2 : "<p></p>";
            items.push(item2);
          }
        }
      }
      break;
    case "branch":
      let els = doc.querySelectorAll("h1");
      order = 0;
      for await (const h1 of els) {
        let item = new JSONOutlineSchemaItem();
        item.title = h1.innerText.trim().replace("  ", " ").replace("  ", " ");
        item.slug = cleanTitle(item.title);
        item.order = order;
        item.parent = parentId;
        order += 1;
        let tmp = await nextUntilElement(h1, ["H1"]);
        let h1Children = tmp.siblings;
        let contents = "";
        for await (const h1Child of h1Children) {
          contents += htmlFromEl(h1Child);
        }
        item.contents = contents !== "" ? contents : getFallbackContent(type);
        items.push(item);
      }
      break;
    case "page":
      let item = new JSONOutlineSchemaItem();
      item.title = filename ? filename.replace(".html", "") : "new page";
      item.slug = cleanTitle(item.title);
      item.parent = parentId;
      item.contents = doc.querySelector("#import-wrapper").innerHTML;
      items.push(item);
      break;
  }
  return items;
}

// replacement for tabs, also support for single line video player calls
function htmlFromEl(el) {
  let textValue = el.innerText.trim();
  // test if this is a stand alone, valid URL
  if (validURL(textValue) && (
    textValue.includes('youtube.com') ||
    textValue.includes('youtu.be') ||
    textValue.includes('youtube-nocookie.com') ||
    textValue.includes('vimeo.com') ||
    textValue.toLowerCase().includes('.mp4')
    )
  ) {
    return `<video-player source="${textValue}"></video-player>`;
  }
  // image
  else if (validURL(textValue) && (
    textValue.toLowerCase().includes('.jpg') ||
    textValue.toLowerCase().includes('.jpeg') ||
    textValue.toLowerCase().includes('.png') ||
    textValue.toLowerCase().includes('.webp')
    )
  ) {
    return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
  }
  // gif
  else if (validURL(textValue) && textValue.toLowerCase().includes('.gif')) {
    return `
    <a11y-gif-player src="${textValue}" style="width: 300px;">
      <simple-img width="300" src="${textValue}"></simple-img>
    </a11y-gif-player>`;
  }
  // test for a common convention for a place holder
  else if (textValue.startsWith('[') && textValue.endsWith(']')) {
    let tmp = textValue.split(':');
    // test for a type definition vs just rendering a basic textual one
    if (tmp.length > 1) {
      let type = tmp.shift().replace('[','');
      let text = tmp.join(':').replace(']','').trim();
      // we only support these types, if it is not one of these then we test other
      // things and could ultimately end on a less specific placeholder
      // I don't trust spelling things :p
      switch(type) {
        case 'math':
        case 'mathjax':
          return `<lrn-math>${text}</lrn-math>`;
        break;
        case 'video':
        case 'audio':
        case 'document':
        case 'text':
        case 'image':
          return `<place-holder type="${type}" text="${text}"></place-holder>`;
        break;
      }
    }
    // see if maybe they put placeholder brackets on the material
    textValue = textValue.replace('[','').replace(']','').trim();
    // video test
    if (validURL(textValue) && (
      textValue.includes('youtube.com') ||
      textValue.includes('youtu.be') ||
      textValue.includes('youtube-nocookie.com') ||
      textValue.includes('vimeo.com') ||
      textValue.includes('twitch.tv') ||
      textValue.toLowerCase().includes('.mp4')
      )
    ) {
      return `<video-player source="${textValue}"></video-player>`;
    }
    // image test
    else if (validURL(textValue) && (
      textValue.toLowerCase().includes('.jpg') ||
      textValue.toLowerCase().includes('.jpeg') ||
      textValue.toLowerCase().includes('.png') ||
      textValue.toLowerCase().includes('.webp')
      )
    ) {
      return `<img src="${textValue}" loading="lazy" decoding="async" fetchpriority="high" alt="" />`;
    }
    // gif test
    else if (validURL(textValue) && textValue.toLowerCase().includes('.gif')) {
      return `
      <a11y-gif-player src="${textValue}" style="width: 300px;">
        <simple-img width="300" src="${textValue}"></simple-img>
      </a11y-gif-player>`;
    }
    // just use a place holder tag since we don't know or they just wanted a note
    // for a resource they don't have yet
    else {
      return `<place-holder type="text" text="${textValue}"></place-holder>`;  
    }
  }
  // test for ! which implies a specififc tag is going to be inserted
  // this is basically just for developers
  else if (textValue.startsWith('!') && textValue.includes('-')) {
    let tag = textValue.replace('!', '').trim();
    return `<${tag}></${tag}>`;
  }
  // allow for inline math replacement
  let content = el.outerHTML.replace(/\t/g, '').trim().replace(/\[math:(.*?)\]/g,'<lrn-math>$1</lrn-math>');
  return content;
}

// based on https://vanillajstoolkit.com/helpers/nextuntil/
async function nextUntilElement(elem, tagMatches) {
	// Setup siblings array
	var siblings = [];
	// Get the next sibling element
	elem = elem.nextElementSibling;
	// As long as a sibling exists
	while (elem) {
		// If we've reached a tag name we want to stop on, bail
		if (tagMatches.includes(elem.tagName)) {
      break;
    }
		// Otherwise, push it to the siblings array
		siblings.push(elem);
		// Get the next sibling element
		elem = elem.nextElementSibling;
	}
	return {
    siblings: siblings,
    lastEl: elem,
  }
};

function getFallbackContent(type) {
  switch (type) {
    case 'portfolio':
      return `<p>Enjoy my portfolio and let me know if you have questions.</p>
<lesson-overview>
  <lesson-highlight smart="pages"></lesson-highlight>
</lesson-overview>`;
    break;
    case 'course':
    return `<p>Welcome to the lesson.</p>
<lesson-overview>
  <lesson-highlight smart="pages"></lesson-highlight>
  <lesson-highlight smart="readTime"></lesson-highlight>
  <lesson-highlight smart="selfChecks"></lesson-highlight>
  <lesson-highlight smart="audio"></lesson-highlight>
  <lesson-highlight smart="video"></lesson-highlight>
</lesson-overview>
<p>Let's begin!</p>`;
    break;
    default:
      return '<p></p>';
    break;
  }
}