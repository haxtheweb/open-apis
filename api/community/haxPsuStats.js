
// duckduckgo.js
// this is an example to fork from that uses common, simple conventions
// for getting data, validating data, and responding in a consistent way.
import { stdPostBody, stdResponse, invalidRequest } from "../utilities/requestHelpers.js";

export default async function handler(req, res) {
  // destructing GET params after ? available in this object
  // use this if POST data is what's being sent
  let body = {};
  let q = null;
  if (req && req.query && req.query.q) {
    body = req.query;
  }
  else if (req.body) {
    body = stdPostBody(req);
  }
  // fallback support for post
  if (body && body.q) {
    q = body.q;
  }
  // need to know what we're searching for otherwise bail
  if (q) {
    // we import fetch just to simplify endpoint creation but its just fetch
    // standard response is how all transactions end
    // this will assume 200 response code unless defined otherwise
    // response data is passed in as searchResults here
    // if type is not set in the options, then it is assumed JSON response
    // and is added to a data param
    const searchResults = await fetch(process.env.HAX_STATS).then((d) => d.ok ? d.json(): {});
    searchResults.links = [];
    var linkResp = '';
    for (var i in Object.keys(searchResults.site_counts)) {
        var key = Object.keys(searchResults.site_counts)[i];
        let link = `<a href="https://oer.hax.psu.edu/${key.split('/')[0]}/sites/${key.split('/')[1]}" target="_blank">${key} (${searchResults.site_counts[key]})</a>`
        searchResults.links.push(link);
        linkResp += "\n\n<li>" + link + "</li>";
    }
    let headers = {
        cache: 86400,
        methods: "OPTIONS, POST, GET"
    };
    let returnData = searchResults;

    if (body && body.raw) {
        headers.type = 'text/html';
        returnData = `<ul>${linkResp}</ul>`;
        res = stdResponse(res, returnData, headers);
    }
    else if (body && body.random) {
      // Generate a random index within the array's length
      const randomIndex = Math.floor(Math.random() * Object.keys(searchResults.site_counts).length);
      let randKey = Object.keys(searchResults.site_counts)[randomIndex];
      returnData = `https://oer.hax.psu.edu/${randKey.split('/')[0]}/sites/${randKey.split('/')[1]}`;
      res.redirect(307, returnData);
    }
    else {
      res = stdResponse(res, returnData, headers);
    }
  }
  else {
    // invalidate the response and provide a reason
    // this optionally takes in a status code otherwise default is 400
    // vercel will through a 500 if there was any bricking issue so we don't
    // need to throw that most likely
    res = invalidRequest(res, 'missing `q` param');
  }
}