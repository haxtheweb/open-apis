// duckduckgo.js
// this is an example to fork from that uses common, simple conventions
// for getting data, validating data, and responding in a consistent way.
import { stdPostBody, stdResponse, invalidRequest } from "../../../utilities/requestHelpers.js";
import * as child_process from "child_process";
import * as util from "node:util";
import * as fs from 'node:fs';
import * as path from 'node:path';
const exec = util.promisify(child_process.exec);
const SITENAME = 'mysite';
const RECIPENAME = 'tmp.recipe';
const ITEMSFILE = 'items.json';
export default async function handler(req, res) {
  // destructing GET params after ? available in this object
  // use this if POST data is what's being sent
  let body = {};
  let q = null;
  if (req && req.query && req.query.q) {
    body = req.query;
  }
  else {
    body = stdPostBody(req);
  }
  // fallback support for post
  if (body && body.q) {
    q = body.q;
  }
  // need to know what we're searching for otherwise bail
  if (q) {
    const { stdout, stdin } = await exec("npm root");
    const HAXPROGRAM = `${stdout.trim()}/.bin/hax`;
    await exec(`${HAXPROGRAM} site ${SITENAME} --y --quiet`);
    // we import fetch just to simplify endpoint creation but its just fetch
    const recipe = await fetch(`${q}`).then((d) => d.ok ? d.text(): {});
    fs.writeFileSync(`${process.cwd()}/${SITENAME}/${RECIPENAME}`, recipe);
    await exec(`${HAXPROGRAM} site recipe:play --y --recipe "${RECIPENAME}" --root "${process.cwd()}/${SITENAME}"`);

    await exec(`${HAXPROGRAM} site site:items --y --format json --to-file "${ITEMSFILE}" --root "${process.cwd()}/${SITENAME}"`);
    const items = JSON.parse(fs.readFileSync(`${process.cwd()}/${SITENAME}/${ITEMSFILE}`, 'utf8'));
    res = stdResponse(res, items, {cache: 86400, methods: "OPTIONS, POST, GET" });
  }
  else {
    // invalidate the response and provide a reason
    // this optionally takes in a status code otherwise default is 400
    // vercel will through a 500 if there was any bricking issue so we don't
    // need to throw that most likely
    res = invalidRequest(res, 'missing `q` param');
  }
}