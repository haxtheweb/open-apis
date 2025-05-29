import { stdPostBody, stdResponse } from "../../utilities/requestHelpers.js";
import { resolveSiteData } from "./lib/JOSHelpers.js";
import { parse } from 'node-html-parser';

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
      body {
        background: #000;
      --simple-colors-default-theme-grey-1: #ffffff;
          --simple-colors-default-theme-grey-2: #eeeeee;
          --simple-colors-default-theme-grey-3: #dddddd;
          --simple-colors-default-theme-grey-4: #cccccc;
          --simple-colors-default-theme-grey-5: #bbbbbb;
          --simple-colors-default-theme-grey-6: #999999;
          --simple-colors-default-theme-grey-7: #666666;
          --simple-colors-default-theme-grey-8: #444444;
          --simple-colors-default-theme-grey-9: #333333;
          --simple-colors-default-theme-grey-10: #222222;
          --simple-colors-default-theme-grey-11: #111111;
          --simple-colors-default-theme-grey-12: #000000;

          --simple-colors-default-theme-red-1: #ffdddd;
          --simple-colors-default-theme-red-2: #ffaeae;
          --simple-colors-default-theme-red-3: #ff8f8f;
          --simple-colors-default-theme-red-4: #ff7474;
          --simple-colors-default-theme-red-5: #fd5151;
          --simple-colors-default-theme-red-6: #ff2222;
          --simple-colors-default-theme-red-7: #ee0000;
          --simple-colors-default-theme-red-8: #ac0000;
          --simple-colors-default-theme-red-9: #850000;
          --simple-colors-default-theme-red-10: #670000;
          --simple-colors-default-theme-red-11: #520000;
          --simple-colors-default-theme-red-12: #3f0000;

          --simple-colors-default-theme-pink-1: #ffe6f1;
          --simple-colors-default-theme-pink-2: #ffa5cf;
          --simple-colors-default-theme-pink-3: #ff87c0;
          --simple-colors-default-theme-pink-4: #ff73b5;
          --simple-colors-default-theme-pink-5: #fd60aa;
          --simple-colors-default-theme-pink-6: #ff3996;
          --simple-colors-default-theme-pink-7: #da004e;
          --simple-colors-default-theme-pink-8: #b80042;
          --simple-colors-default-theme-pink-9: #980036;
          --simple-colors-default-theme-pink-10: #78002b;
          --simple-colors-default-theme-pink-11: #5a0020;
          --simple-colors-default-theme-pink-12: #440019;

          --simple-colors-default-theme-purple-1: #fce6ff;
          --simple-colors-default-theme-purple-2: #f4affd;
          --simple-colors-default-theme-purple-3: #f394ff;
          --simple-colors-default-theme-purple-4: #f07cff;
          --simple-colors-default-theme-purple-5: #ed61ff;
          --simple-colors-default-theme-purple-6: #e200ff;
          --simple-colors-default-theme-purple-7: #a500ba;
          --simple-colors-default-theme-purple-8: #8a009b;
          --simple-colors-default-theme-purple-9: #6c0079;
          --simple-colors-default-theme-purple-10: #490052;
          --simple-colors-default-theme-purple-11: #33003a;
          --simple-colors-default-theme-purple-12: #200025;

          --simple-colors-default-theme-deep-purple-1: #f3e4ff;
          --simple-colors-default-theme-deep-purple-2: #ddacff;
          --simple-colors-default-theme-deep-purple-3: #c97eff;
          --simple-colors-default-theme-deep-purple-4: #bb63f9;
          --simple-colors-default-theme-deep-purple-5: #b44aff;
          --simple-colors-default-theme-deep-purple-6: #a931ff;
          --simple-colors-default-theme-deep-purple-7: #7e00d8;
          --simple-colors-default-theme-deep-purple-8: #5d009f;
          --simple-colors-default-theme-deep-purple-9: #4c0081;
          --simple-colors-default-theme-deep-purple-10: #3a0063;
          --simple-colors-default-theme-deep-purple-11: #2a0049;
          --simple-colors-default-theme-deep-purple-12: #1d0033;

          --simple-colors-default-theme-indigo-1: #e5ddff;
          --simple-colors-default-theme-indigo-2: #c3b2ff;
          --simple-colors-default-theme-indigo-3: #af97ff;
          --simple-colors-default-theme-indigo-4: #9e82ff;
          --simple-colors-default-theme-indigo-5: #9373ff;
          --simple-colors-default-theme-indigo-6: #835fff;
          --simple-colors-default-theme-indigo-7: #3a00ff;
          --simple-colors-default-theme-indigo-8: #2801b0;
          --simple-colors-default-theme-indigo-9: #20008c;
          --simple-colors-default-theme-indigo-10: #160063;
          --simple-colors-default-theme-indigo-11: #100049;
          --simple-colors-default-theme-indigo-12: #0a0030;

          --simple-colors-default-theme-blue-1: #e2ecff;
          --simple-colors-default-theme-blue-2: #acc9ff;
          --simple-colors-default-theme-blue-3: #95baff;
          --simple-colors-default-theme-blue-4: #74a5ff;
          --simple-colors-default-theme-blue-5: #5892fd;
          --simple-colors-default-theme-blue-6: #4083ff;
          --simple-colors-default-theme-blue-7: #0059ff;
          --simple-colors-default-theme-blue-8: #0041bb;
          --simple-colors-default-theme-blue-9: #003494;
          --simple-colors-default-theme-blue-10: #002569;
          --simple-colors-default-theme-blue-11: #001947;
          --simple-colors-default-theme-blue-12: #001333;

          --simple-colors-default-theme-light-blue-1: #cde8ff;
          --simple-colors-default-theme-light-blue-2: #a1d1ff;
          --simple-colors-default-theme-light-blue-3: #92c9ff;
          --simple-colors-default-theme-light-blue-4: #65b3ff;
          --simple-colors-default-theme-light-blue-5: #58adff;
          --simple-colors-default-theme-light-blue-6: #41a1ff;
          --simple-colors-default-theme-light-blue-7: #007ffc;
          --simple-colors-default-theme-light-blue-8: #0066ca;
          --simple-colors-default-theme-light-blue-9: #0055a8;
          --simple-colors-default-theme-light-blue-10: #003f7d;
          --simple-colors-default-theme-light-blue-11: #002850;
          --simple-colors-default-theme-light-blue-12: #001b36;

          --simple-colors-default-theme-cyan-1: #ccf3fd;
          --simple-colors-default-theme-cyan-2: #9beaff;
          --simple-colors-default-theme-cyan-3: #77e2ff;
          --simple-colors-default-theme-cyan-4: #33d4ff;
          --simple-colors-default-theme-cyan-5: #1ccfff;
          --simple-colors-default-theme-cyan-6: #00c9ff;
          --simple-colors-default-theme-cyan-7: #009dc7;
          --simple-colors-default-theme-cyan-8: #007999;
          --simple-colors-default-theme-cyan-9: #005970;
          --simple-colors-default-theme-cyan-10: #003f50;
          --simple-colors-default-theme-cyan-11: #002c38;
          --simple-colors-default-theme-cyan-12: #001a20;

          --simple-colors-default-theme-teal-1: #d4ffee;
          --simple-colors-default-theme-teal-2: #98ffd7;
          --simple-colors-default-theme-teal-3: #79ffcb;
          --simple-colors-default-theme-teal-4: #56ffbd;
          --simple-colors-default-theme-teal-5: #29ffac;
          --simple-colors-default-theme-teal-6: #00ff9c;
          --simple-colors-default-theme-teal-7: #009d75;
          --simple-colors-default-theme-teal-8: #007658;
          --simple-colors-default-theme-teal-9: #004e3a;
          --simple-colors-default-theme-teal-10: #003829;
          --simple-colors-default-theme-teal-11: #002a20;
          --simple-colors-default-theme-teal-12: #001b14;

          --simple-colors-default-theme-green-1: #e1ffeb;
          --simple-colors-default-theme-green-2: #acffc9;
          --simple-colors-default-theme-green-3: #79ffa7;
          --simple-colors-default-theme-green-4: #49ff88;
          --simple-colors-default-theme-green-5: #24ff70;
          --simple-colors-default-theme-green-6: #00f961;
          --simple-colors-default-theme-green-7: #008c37;
          --simple-colors-default-theme-green-8: #00762e;
          --simple-colors-default-theme-green-9: #005a23;
          --simple-colors-default-theme-green-10: #003d18;
          --simple-colors-default-theme-green-11: #002a11;
          --simple-colors-default-theme-green-12: #001d0c;

          --simple-colors-default-theme-light-green-1: #ebffdb;
          --simple-colors-default-theme-light-green-2: #c7ff9b;
          --simple-colors-default-theme-light-green-3: #b1ff75;
          --simple-colors-default-theme-light-green-4: #a1fd5a;
          --simple-colors-default-theme-light-green-5: #8efd38;
          --simple-colors-default-theme-light-green-6: #6fff00;
          --simple-colors-default-theme-light-green-7: #429d00;
          --simple-colors-default-theme-light-green-8: #357f00;
          --simple-colors-default-theme-light-green-9: #296100;
          --simple-colors-default-theme-light-green-10: #1b3f00;
          --simple-colors-default-theme-light-green-11: #143000;
          --simple-colors-default-theme-light-green-12: #0d2000;

          --simple-colors-default-theme-lime-1: #f1ffd2;
          --simple-colors-default-theme-lime-2: #dfff9b;
          --simple-colors-default-theme-lime-3: #d4ff77;
          --simple-colors-default-theme-lime-4: #caff58;
          --simple-colors-default-theme-lime-5: #bdff2d;
          --simple-colors-default-theme-lime-6: #aeff00;
          --simple-colors-default-theme-lime-7: #649900;
          --simple-colors-default-theme-lime-8: #4d7600;
          --simple-colors-default-theme-lime-9: #3b5a00;
          --simple-colors-default-theme-lime-10: #293f00;
          --simple-colors-default-theme-lime-11: #223400;
          --simple-colors-default-theme-lime-12: #182400;

          --simple-colors-default-theme-yellow-1: #ffffd5;
          --simple-colors-default-theme-yellow-2: #ffffac;
          --simple-colors-default-theme-yellow-3: #ffff90;
          --simple-colors-default-theme-yellow-4: #ffff7c;
          --simple-colors-default-theme-yellow-5: #ffff3a;
          --simple-colors-default-theme-yellow-6: #f6f600;
          --simple-colors-default-theme-yellow-7: #929100;
          --simple-colors-default-theme-yellow-8: #787700;
          --simple-colors-default-theme-yellow-9: #585700;
          --simple-colors-default-theme-yellow-10: #454400;
          --simple-colors-default-theme-yellow-11: #303000;
          --simple-colors-default-theme-yellow-12: #242400;

          --simple-colors-default-theme-amber-1: #fff2d4;
          --simple-colors-default-theme-amber-2: #ffdf92;
          --simple-colors-default-theme-amber-3: #ffd677;
          --simple-colors-default-theme-amber-4: #ffcf5e;
          --simple-colors-default-theme-amber-5: #ffc235;
          --simple-colors-default-theme-amber-6: #ffc500;
          --simple-colors-default-theme-amber-7: #b28900;
          --simple-colors-default-theme-amber-8: #876800;
          --simple-colors-default-theme-amber-9: #614b00;
          --simple-colors-default-theme-amber-10: #413200;
          --simple-colors-default-theme-amber-11: #302500;
          --simple-colors-default-theme-amber-12: #221a00;

          --simple-colors-default-theme-orange-1: #ffebd7;
          --simple-colors-default-theme-orange-2: #ffca92;
          --simple-colors-default-theme-orange-3: #ffbd75;
          --simple-colors-default-theme-orange-4: #ffb05c;
          --simple-colors-default-theme-orange-5: #ff9e36;
          --simple-colors-default-theme-orange-6: #ff9625;
          --simple-colors-default-theme-orange-7: #e56a00;
          --simple-colors-default-theme-orange-8: #ae5100;
          --simple-colors-default-theme-orange-9: #833d00;
          --simple-colors-default-theme-orange-10: #612d00;
          --simple-colors-default-theme-orange-11: #3d1c00;
          --simple-colors-default-theme-orange-12: #2c1400;

          --simple-colors-default-theme-deep-orange-1: #ffe7e0;
          --simple-colors-default-theme-deep-orange-2: #ffb299;
          --simple-colors-default-theme-deep-orange-3: #ffa588;
          --simple-colors-default-theme-deep-orange-4: #ff8a64;
          --simple-colors-default-theme-deep-orange-5: #ff7649;
          --simple-colors-default-theme-deep-orange-6: #ff6c3c;
          --simple-colors-default-theme-deep-orange-7: #f53100;
          --simple-colors-default-theme-deep-orange-8: #b92500;
          --simple-colors-default-theme-deep-orange-9: #8a1c00;
          --simple-colors-default-theme-deep-orange-10: #561100;
          --simple-colors-default-theme-deep-orange-11: #3a0c00;
          --simple-colors-default-theme-deep-orange-12: #240700;

          --simple-colors-default-theme-brown-1: #f0e2de;
          --simple-colors-default-theme-brown-2: #e5b8aa;
          --simple-colors-default-theme-brown-3: #c59485;
          --simple-colors-default-theme-brown-4: #b68373;
          --simple-colors-default-theme-brown-5: #ac7868;
          --simple-colors-default-theme-brown-6: #a47060;
          --simple-colors-default-theme-brown-7: #85574a;
          --simple-colors-default-theme-brown-8: #724539;
          --simple-colors-default-theme-brown-9: #5b3328;
          --simple-colors-default-theme-brown-10: #3b1e15;
          --simple-colors-default-theme-brown-11: #2c140e;
          --simple-colors-default-theme-brown-12: #200e09;

          --simple-colors-default-theme-blue-grey-1: #e7eff1;
          --simple-colors-default-theme-blue-grey-2: #b1c5ce;
          --simple-colors-default-theme-blue-grey-3: #9badb6;
          --simple-colors-default-theme-blue-grey-4: #8d9fa7;
          --simple-colors-default-theme-blue-grey-5: #7a8f98;
          --simple-colors-default-theme-blue-grey-6: #718892;
          --simple-colors-default-theme-blue-grey-7: #56707c;
          --simple-colors-default-theme-blue-grey-8: #40535b;
          --simple-colors-default-theme-blue-grey-9: #2f3e45;
          --simple-colors-default-theme-blue-grey-10: #1e282c;
          --simple-colors-default-theme-blue-grey-11: #182023;
          --simple-colors-default-theme-blue-grey-12: #0f1518;
          --simple-colors-fixed-theme-accent-1: #ffffff;
          --simple-colors-fixed-theme-accent-2: #eeeeee;
          --simple-colors-fixed-theme-accent-3: #dddddd;
          --simple-colors-fixed-theme-accent-4: #cccccc;
          --simple-colors-fixed-theme-accent-5: #bbbbbb;
          --simple-colors-fixed-theme-accent-6: #999999;
          --simple-colors-fixed-theme-accent-7: #666666;
          --simple-colors-fixed-theme-accent-8: #444444;
          --simple-colors-fixed-theme-accent-9: #333333;
          --simple-colors-fixed-theme-accent-10: #222222;
          --simple-colors-fixed-theme-accent-11: #111111;
          --simple-colors-fixed-theme-accent-12: #000000;

          --simple-colors-fixed-theme-grey-1: #ffffff;
          --simple-colors-fixed-theme-grey-2: #eeeeee;
          --simple-colors-fixed-theme-grey-3: #dddddd;
          --simple-colors-fixed-theme-grey-4: #cccccc;
          --simple-colors-fixed-theme-grey-5: #bbbbbb;
          --simple-colors-fixed-theme-grey-6: #999999;
          --simple-colors-fixed-theme-grey-7: #666666;
          --simple-colors-fixed-theme-grey-8: #444444;
          --simple-colors-fixed-theme-grey-9: #333333;
          --simple-colors-fixed-theme-grey-10: #222222;
          --simple-colors-fixed-theme-grey-11: #111111;
          --simple-colors-fixed-theme-grey-12: #000000;

          --simple-colors-fixed-theme-red-1: #ffdddd;
          --simple-colors-fixed-theme-red-2: #ffaeae;
          --simple-colors-fixed-theme-red-3: #ff8f8f;
          --simple-colors-fixed-theme-red-4: #ff7474;
          --simple-colors-fixed-theme-red-5: #fd5151;
          --simple-colors-fixed-theme-red-6: #ff2222;
          --simple-colors-fixed-theme-red-7: #ee0000;
          --simple-colors-fixed-theme-red-8: #ac0000;
          --simple-colors-fixed-theme-red-9: #850000;
          --simple-colors-fixed-theme-red-10: #670000;
          --simple-colors-fixed-theme-red-11: #520000;
          --simple-colors-fixed-theme-red-12: #3f0000;

          --simple-colors-fixed-theme-pink-1: #ffe6f1;
          --simple-colors-fixed-theme-pink-2: #ffa5cf;
          --simple-colors-fixed-theme-pink-3: #ff87c0;
          --simple-colors-fixed-theme-pink-4: #ff73b5;
          --simple-colors-fixed-theme-pink-5: #fd60aa;
          --simple-colors-fixed-theme-pink-6: #ff3996;
          --simple-colors-fixed-theme-pink-7: #da004e;
          --simple-colors-fixed-theme-pink-8: #b80042;
          --simple-colors-fixed-theme-pink-9: #980036;
          --simple-colors-fixed-theme-pink-10: #78002b;
          --simple-colors-fixed-theme-pink-11: #5a0020;
          --simple-colors-fixed-theme-pink-12: #440019;

          --simple-colors-fixed-theme-purple-1: #fce6ff;
          --simple-colors-fixed-theme-purple-2: #f4affd;
          --simple-colors-fixed-theme-purple-3: #f394ff;
          --simple-colors-fixed-theme-purple-4: #f07cff;
          --simple-colors-fixed-theme-purple-5: #ed61ff;
          --simple-colors-fixed-theme-purple-6: #e200ff;
          --simple-colors-fixed-theme-purple-7: #a500ba;
          --simple-colors-fixed-theme-purple-8: #8a009b;
          --simple-colors-fixed-theme-purple-9: #6c0079;
          --simple-colors-fixed-theme-purple-10: #490052;
          --simple-colors-fixed-theme-purple-11: #33003a;
          --simple-colors-fixed-theme-purple-12: #200025;

          --simple-colors-fixed-theme-deep-purple-1: #f3e4ff;
          --simple-colors-fixed-theme-deep-purple-2: #ddacff;
          --simple-colors-fixed-theme-deep-purple-3: #c97eff;
          --simple-colors-fixed-theme-deep-purple-4: #bb63f9;
          --simple-colors-fixed-theme-deep-purple-5: #b44aff;
          --simple-colors-fixed-theme-deep-purple-6: #a931ff;
          --simple-colors-fixed-theme-deep-purple-7: #7e00d8;
          --simple-colors-fixed-theme-deep-purple-8: #5d009f;
          --simple-colors-fixed-theme-deep-purple-9: #4c0081;
          --simple-colors-fixed-theme-deep-purple-10: #3a0063;
          --simple-colors-fixed-theme-deep-purple-11: #2a0049;
          --simple-colors-fixed-theme-deep-purple-12: #1d0033;

          --simple-colors-fixed-theme-indigo-1: #e5ddff;
          --simple-colors-fixed-theme-indigo-2: #c3b2ff;
          --simple-colors-fixed-theme-indigo-3: #af97ff;
          --simple-colors-fixed-theme-indigo-4: #9e82ff;
          --simple-colors-fixed-theme-indigo-5: #9373ff;
          --simple-colors-fixed-theme-indigo-6: #835fff;
          --simple-colors-fixed-theme-indigo-7: #3a00ff;
          --simple-colors-fixed-theme-indigo-8: #2801b0;
          --simple-colors-fixed-theme-indigo-9: #20008c;
          --simple-colors-fixed-theme-indigo-10: #160063;
          --simple-colors-fixed-theme-indigo-11: #100049;
          --simple-colors-fixed-theme-indigo-12: #0a0030;

          --simple-colors-fixed-theme-blue-1: #e2ecff;
          --simple-colors-fixed-theme-blue-2: #acc9ff;
          --simple-colors-fixed-theme-blue-3: #95baff;
          --simple-colors-fixed-theme-blue-4: #74a5ff;
          --simple-colors-fixed-theme-blue-5: #5892fd;
          --simple-colors-fixed-theme-blue-6: #4083ff;
          --simple-colors-fixed-theme-blue-7: #0059ff;
          --simple-colors-fixed-theme-blue-8: #0041bb;
          --simple-colors-fixed-theme-blue-9: #003494;
          --simple-colors-fixed-theme-blue-10: #002569;
          --simple-colors-fixed-theme-blue-11: #001947;
          --simple-colors-fixed-theme-blue-12: #001333;

          --simple-colors-fixed-theme-light-blue-1: #cde8ff;
          --simple-colors-fixed-theme-light-blue-2: #a1d1ff;
          --simple-colors-fixed-theme-light-blue-3: #92c9ff;
          --simple-colors-fixed-theme-light-blue-4: #65b3ff;
          --simple-colors-fixed-theme-light-blue-5: #58adff;
          --simple-colors-fixed-theme-light-blue-6: #41a1ff;
          --simple-colors-fixed-theme-light-blue-7: #007ffc;
          --simple-colors-fixed-theme-light-blue-8: #0066ca;
          --simple-colors-fixed-theme-light-blue-9: #0055a8;
          --simple-colors-fixed-theme-light-blue-10: #003f7d;
          --simple-colors-fixed-theme-light-blue-11: #002850;
          --simple-colors-fixed-theme-light-blue-12: #001b36;

          --simple-colors-fixed-theme-cyan-1: #ccf3fd;
          --simple-colors-fixed-theme-cyan-2: #9beaff;
          --simple-colors-fixed-theme-cyan-3: #77e2ff;
          --simple-colors-fixed-theme-cyan-4: #33d4ff;
          --simple-colors-fixed-theme-cyan-5: #1ccfff;
          --simple-colors-fixed-theme-cyan-6: #00c9ff;
          --simple-colors-fixed-theme-cyan-7: #009dc7;
          --simple-colors-fixed-theme-cyan-8: #007999;
          --simple-colors-fixed-theme-cyan-9: #005970;
          --simple-colors-fixed-theme-cyan-10: #003f50;
          --simple-colors-fixed-theme-cyan-11: #002c38;
          --simple-colors-fixed-theme-cyan-12: #001a20;

          --simple-colors-fixed-theme-teal-1: #d4ffee;
          --simple-colors-fixed-theme-teal-2: #98ffd7;
          --simple-colors-fixed-theme-teal-3: #79ffcb;
          --simple-colors-fixed-theme-teal-4: #56ffbd;
          --simple-colors-fixed-theme-teal-5: #29ffac;
          --simple-colors-fixed-theme-teal-6: #00ff9c;
          --simple-colors-fixed-theme-teal-7: #009d75;
          --simple-colors-fixed-theme-teal-8: #007658;
          --simple-colors-fixed-theme-teal-9: #004e3a;
          --simple-colors-fixed-theme-teal-10: #003829;
          --simple-colors-fixed-theme-teal-11: #002a20;
          --simple-colors-fixed-theme-teal-12: #001b14;

          --simple-colors-fixed-theme-green-1: #e1ffeb;
          --simple-colors-fixed-theme-green-2: #acffc9;
          --simple-colors-fixed-theme-green-3: #79ffa7;
          --simple-colors-fixed-theme-green-4: #49ff88;
          --simple-colors-fixed-theme-green-5: #24ff70;
          --simple-colors-fixed-theme-green-6: #00f961;
          --simple-colors-fixed-theme-green-7: #008c37;
          --simple-colors-fixed-theme-green-8: #00762e;
          --simple-colors-fixed-theme-green-9: #005a23;
          --simple-colors-fixed-theme-green-10: #003d18;
          --simple-colors-fixed-theme-green-11: #002a11;
          --simple-colors-fixed-theme-green-12: #001d0c;

          --simple-colors-fixed-theme-light-green-1: #ebffdb;
          --simple-colors-fixed-theme-light-green-2: #c7ff9b;
          --simple-colors-fixed-theme-light-green-3: #b1ff75;
          --simple-colors-fixed-theme-light-green-4: #a1fd5a;
          --simple-colors-fixed-theme-light-green-5: #8efd38;
          --simple-colors-fixed-theme-light-green-6: #6fff00;
          --simple-colors-fixed-theme-light-green-7: #429d00;
          --simple-colors-fixed-theme-light-green-8: #357f00;
          --simple-colors-fixed-theme-light-green-9: #296100;
          --simple-colors-fixed-theme-light-green-10: #1b3f00;
          --simple-colors-fixed-theme-light-green-11: #143000;
          --simple-colors-fixed-theme-light-green-12: #0d2000;

          --simple-colors-fixed-theme-lime-1: #f1ffd2;
          --simple-colors-fixed-theme-lime-2: #dfff9b;
          --simple-colors-fixed-theme-lime-3: #d4ff77;
          --simple-colors-fixed-theme-lime-4: #caff58;
          --simple-colors-fixed-theme-lime-5: #bdff2d;
          --simple-colors-fixed-theme-lime-6: #aeff00;
          --simple-colors-fixed-theme-lime-7: #649900;
          --simple-colors-fixed-theme-lime-8: #4d7600;
          --simple-colors-fixed-theme-lime-9: #3b5a00;
          --simple-colors-fixed-theme-lime-10: #293f00;
          --simple-colors-fixed-theme-lime-11: #223400;
          --simple-colors-fixed-theme-lime-12: #182400;

          --simple-colors-fixed-theme-yellow-1: #ffffd5;
          --simple-colors-fixed-theme-yellow-2: #ffffac;
          --simple-colors-fixed-theme-yellow-3: #ffff90;
          --simple-colors-fixed-theme-yellow-4: #ffff7c;
          --simple-colors-fixed-theme-yellow-5: #ffff3a;
          --simple-colors-fixed-theme-yellow-6: #f6f600;
          --simple-colors-fixed-theme-yellow-7: #929100;
          --simple-colors-fixed-theme-yellow-8: #787700;
          --simple-colors-fixed-theme-yellow-9: #585700;
          --simple-colors-fixed-theme-yellow-10: #454400;
          --simple-colors-fixed-theme-yellow-11: #303000;
          --simple-colors-fixed-theme-yellow-12: #242400;

          --simple-colors-fixed-theme-amber-1: #fff2d4;
          --simple-colors-fixed-theme-amber-2: #ffdf92;
          --simple-colors-fixed-theme-amber-3: #ffd677;
          --simple-colors-fixed-theme-amber-4: #ffcf5e;
          --simple-colors-fixed-theme-amber-5: #ffc235;
          --simple-colors-fixed-theme-amber-6: #ffc500;
          --simple-colors-fixed-theme-amber-7: #b28900;
          --simple-colors-fixed-theme-amber-8: #876800;
          --simple-colors-fixed-theme-amber-9: #614b00;
          --simple-colors-fixed-theme-amber-10: #413200;
          --simple-colors-fixed-theme-amber-11: #302500;
          --simple-colors-fixed-theme-amber-12: #221a00;

          --simple-colors-fixed-theme-orange-1: #ffebd7;
          --simple-colors-fixed-theme-orange-2: #ffca92;
          --simple-colors-fixed-theme-orange-3: #ffbd75;
          --simple-colors-fixed-theme-orange-4: #ffb05c;
          --simple-colors-fixed-theme-orange-5: #ff9e36;
          --simple-colors-fixed-theme-orange-6: #ff9625;
          --simple-colors-fixed-theme-orange-7: #e56a00;
          --simple-colors-fixed-theme-orange-8: #ae5100;
          --simple-colors-fixed-theme-orange-9: #833d00;
          --simple-colors-fixed-theme-orange-10: #612d00;
          --simple-colors-fixed-theme-orange-11: #3d1c00;
          --simple-colors-fixed-theme-orange-12: #2c1400;

          --simple-colors-fixed-theme-deep-orange-1: #ffe7e0;
          --simple-colors-fixed-theme-deep-orange-2: #ffb299;
          --simple-colors-fixed-theme-deep-orange-3: #ffa588;
          --simple-colors-fixed-theme-deep-orange-4: #ff8a64;
          --simple-colors-fixed-theme-deep-orange-5: #ff7649;
          --simple-colors-fixed-theme-deep-orange-6: #ff6c3c;
          --simple-colors-fixed-theme-deep-orange-7: #f53100;
          --simple-colors-fixed-theme-deep-orange-8: #b92500;
          --simple-colors-fixed-theme-deep-orange-9: #8a1c00;
          --simple-colors-fixed-theme-deep-orange-10: #561100;
          --simple-colors-fixed-theme-deep-orange-11: #3a0c00;
          --simple-colors-fixed-theme-deep-orange-12: #240700;

          --simple-colors-fixed-theme-brown-1: #f0e2de;
          --simple-colors-fixed-theme-brown-2: #e5b8aa;
          --simple-colors-fixed-theme-brown-3: #c59485;
          --simple-colors-fixed-theme-brown-4: #b68373;
          --simple-colors-fixed-theme-brown-5: #ac7868;
          --simple-colors-fixed-theme-brown-6: #a47060;
          --simple-colors-fixed-theme-brown-7: #85574a;
          --simple-colors-fixed-theme-brown-8: #724539;
          --simple-colors-fixed-theme-brown-9: #5b3328;
          --simple-colors-fixed-theme-brown-10: #3b1e15;
          --simple-colors-fixed-theme-brown-11: #2c140e;
          --simple-colors-fixed-theme-brown-12: #200e09;

          --simple-colors-fixed-theme-blue-grey-1: #e7eff1;
          --simple-colors-fixed-theme-blue-grey-2: #b1c5ce;
          --simple-colors-fixed-theme-blue-grey-3: #9badb6;
          --simple-colors-fixed-theme-blue-grey-4: #8d9fa7;
          --simple-colors-fixed-theme-blue-grey-5: #7a8f98;
          --simple-colors-fixed-theme-blue-grey-6: #718892;
          --simple-colors-fixed-theme-blue-grey-7: #56707c;
          --simple-colors-fixed-theme-blue-grey-8: #40535b;
          --simple-colors-fixed-theme-blue-grey-9: #2f3e45;
          --simple-colors-fixed-theme-blue-grey-10: #1e282c;
          --simple-colors-fixed-theme-blue-grey-11: #182023;
          --simple-colors-fixed-theme-blue-grey-12: #0f1518;  
      }
      /**
       *  @deprecated ELMS:LN textbook styles
       * https://github.com/haxtheweb/issues/issues/1658
       */
      /* Required list template */
      .textbook_box {
        display: block;
        margin: 1em 0px 2em 0px;
        padding: .5em;
        border-radius: 4px 4px 0px 0px;
      }
      .textbook_box h3 {
        font-size: 24px;
        font-weight: bold;
        display: block;
        float: right;
        margin-top: -25px !important;
        margin-bottom: 0px;
        margin-left: 5px;
        margin-right:0px;
        background-color: var(--simple-colors-default-theme-grey-2);
        border:2px solid;
        padding:4px 6px;
        letter-spacing:.06em;
        border-radius: 4px;
      }
      .textbook_box_required {
        border: var(--simple-colors-default-theme-pink-8) 2px solid;
      }
      .textbook_box_required h3{
        color: var(--simple-colors-default-theme-pink-8);
      }
      .textbook_box_required li:before{
        color: var(--simple-colors-default-theme-grey-1);
        background:  var(--simple-colors-default-theme-pink-8);
      }
      .textbook_box_required li:hover:before{
      font-weight:bold;
      color: var(--simple-colors-default-theme-pink-8);
      border: .3em solid  var(--simple-colors-default-theme-pink-8);
      background: var(--simple-colors-default-theme-grey-1);
      }
      /* Optional list color shift */
      .textbook_box_optional {
        border:var(--simple-colors-default-theme-cyan-8) 2px solid;
      }
      .textbook_box_optional h3{
        color: var(--simple-colors-default-theme-cyan-8);
      }
      .textbook_box_optional li:before{
        color: var(--simple-colors-default-theme-grey-1);
        background: var(--simple-colors-default-theme-cyan-8);
      }
      .textbook_box_optional li:hover:before{
      font-weight:bold;
      color: var(--simple-colors-default-theme-cyan-8);
      border: .3em solid var(--simple-colors-default-theme-cyan-8);
      background: var(--simple-colors-default-theme-grey-1);
      }

      .textbook_box ol, div.textbook_box ul{
        counter-reset: li; /* Initiate a counter */
        list-style: none; /* Remove default numbering */
        font: 15px 'trebuchet MS', 'lucida sans';
        padding: 0px 0px 0px 14px;
        margin: 30px 20px 20px;
        text-shadow: 0 1px 0 rgba(255,255,255,.5);
      }

      .textbook_box li{
        position: relative;
        display: block;
        padding: .4em .4em .4em 2em;
        margin: .7em 0 !important;
        background: var(--simple-colors-default-theme-grey-1);
        color: var(--simple-colors-default-theme-grey-9);
        text-decoration: none;
        border-radius: .3em;
        transition: all .3s ease-out;
        font-size: 14px;
        line-height: 24px;
      }

      .textbook_box li:hover{
        background: var(--simple-colors-default-theme-grey-2);
      }

      .textbook_box li:before{
        content: counter(li);
        counter-increment: li;
        position: absolute;  
        left: -1.3em;
        top: 50%;
        margin-top: -1.3em;
        height: 2em;
        width: 2em;
        line-height: 2em;
        border: .3em solid var(--simple-colors-default-theme-grey-1);
        text-align: center;
        font-weight: bold;
        border-radius: 2em;
        transition: all .3s ease-out;
      }
      /* responsive iframe */
      .responsive-iframe-container {
        position: relative;
        overflow: hidden;
        width: 100%;
        padding-top: 56.25%;
      }

      .responsive-iframe {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        width: 100%;
        height: 100%;
      }
      /* editable table */
      .offscreen {
      position: absolute;
      left: -9999px;
      font-size: 0;
      height: 0;
      width: 0;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }
    table {
      width: calc(100% - 2 * var(--editable-table-border-width, 1px));
      display: table;
      border-collapse: collapse;
      border-width: var(--editable-table-border-width, 1px);
      border-style: var(--editable-table-border-style, solid);
      border-color: var(--editable-table-border-color, #999);
      font-weight: var(--editable-table-light-weight, 200);
      color: var(--editable-table-color, #222);
      background-color: var(
        --editable-table-bg-color,
        var(--ddd-theme-default-white, #fff)
      );
    }
    .th,
    .td,
    .th-or-td .icon-container {
      font-weight: var(--editable-table-light-weight, 200);
      color: var(--editable-table-color, #222);
      background-color: var(
        --editable-table-bg-color,
        var(--ddd-theme-default-white, #fff)
      );
    }
    caption {
      font-size: var(
        --editable-table-caption-font-size,
        var(--editable-table-font-size, unset)
      );
      font-weight: var(--editable-table-heavy-weight, 600);
      color: var(
        --editable-table-caption-color,
        var(--editable-table-color, #222)
      );
      background-color: var(
        --editable-table-caption-bg-color,
        var(--editable-table-bg-color, #fff)
      );
      width: 100%;
    }
    .tr {
      display: table-row;
    }
    .th-or-td {
      display: table-cell;
    }
    .thead-tr .th,
    .thead-tr .th .icon-container {
      background-color: var(
        --editable-table-heading-bg-color,
        var(--ddd-theme-default-limestoneLight, #e0e0e0)
      );
      font-weight: var(--editable-table-heavy-weight, 600);
      color: var(
        --editable-table-heading-color,
        var(--ddd-theme-default-coalyGray, #000)
      );
    }
    .tbody-tr .th,
    .tbody-tr .th .icon-container {
      font-weight: var(--editable-table-heavy-weight, 600);
      color: var(
        --editable-table-heading-color,
        var(--ddd-theme-default-coalyGray, #000)
      );
      background-color: var(
        --editable-table-bg-color,
        var(--ddd-theme-default-white, #fff)
      );
      text-align: left;
    }
    *[bordered] .th,
    *[bordered] .td {
      border-width: var(--editable-table-border-width, 1px);
      border-style: var(--editable-table-border-style, solid);
      border-color: var(
        --editable-table-border-color,
        var(--ddd-theme-default-coalyGray, #999)
      );
    }
    *[condensed] {
      --editable-table-cell-vertical-padding: var(
        --editable-table-cell-vertical-padding-condensed,
        2px
      );
      --editable-table-cell-horizontal-padding: var(
        --editable-table-cell-horizontal-padding-condensed,
        4px
      );
    }
    *[striped] .tbody-tr:nth-child(2n + 1) .th-or-td,
    *[striped] .tbody-tr:nth-child(2n + 1) .th-or-td .icon-container {
      background-color: var(
        --editable-table-stripe-bg-color,
        var(--ddd-theme-default-limestoneMaxLight, #f0f0f0)
      );
    }
    *[column-striped] .tbody-tr .th-or-td:nth-child(2n),
    *[column-striped] .tbody-tr .th-or-td:nth-child(2n) .icon-container,
    *[column-striped] .tfoot-tr .th-or-td:nth-child(2n),
    *[column-striped] .tfoot-tr .th-or-td:nth-child(2n) .icon-container {
      background-color: var(
        --editable-table-stripe-bg-color,
        var(--ddd-theme-default-limestoneMaxLight, #f0f0f0)
      );
    }
    .tfoot-tr .th,
    .tfoot-tr .td {
      border-top: 2px solid var(--editable-table-color, #222);
      font-weight: var(--editable-table-heavy-weight, 600);
      color: var(
        --editable-table-heading-color,
        var(--ddd-theme-default-coalyGray, #000)
      );
    }
    caption,
    .th-or-td {
      text-align: left;
    }
    *[numeric-styles] .thead-tr .th-or-td[numeric],
    *[numeric-styles] .tfoot-tr .th-or-td[numeric],
    *[numeric-styles] .th-or-td[numeric] .cell {
      text-align: right;
      --editable-table-cell-justify: flex-end;
    }
    *[numeric-styles] .tfoot-tr .th-or-td[negative],
    *[numeric-styles] .td[negative] .cell {
      color: var(--editable-table-negative-color, red);
      --editable-table-cell-color: var(--editable-table-negative-color, red);
    }
    caption {
      padding-top: var(--editable-table-cell-vertical-padding, 10px);
      padding-bottom: var(--editable-table-cell-vertical-padding, 10px);
      padding: 0;
    }
    caption > div {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
    }
    caption > div > div {
      flex: 1 1 auto;
    }
    caption > div > div:last-child {
      flex: 0 0 auto;
    }
    caption button {
      padding: 2px;
      margin: 0;
    }
    .column {
      width: calc(var(--simple-picker-option-size) + 6px);
      overflow: visible;
      display: none;
      margin-right: 0px;
      --simple-picker-border-width: 1px;
      --simple-picker-focus-border-width: 1px;
      --simple-picker-border-color: var(
        --editable-table-border-color,
        var(--ddd-theme-default-coalyGray, #999)
      );
    }
    .th,
    .td {
      padding: var(
          --editable-table-cell-vertical-padding,
          var(--ddd-spacing-3, 10px)
        )
        var(--editable-table-cell-horizontal-padding, var(--ddd-spacing-2, 6px));
    }
    span.cell {
      display: block;
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

export async function pagesAsData(site, ancestor, siteLocation) {
  var data = [];
  let items = [];
  // ordered by ancestor if provided
  if (ancestor != null) {
    items = await site.findBranch(ancestor).filter(function(el) {
      // walk up the tree to ensure no parent is unpublished
      if (el && el.parent != null) {
        let tmpEl = {...el};
        while (tmpEl.parent != null) {
          tmpEl = site.getItemById(tmpEl.parent);
          if (tmpEl && tmpEl.metadata && tmpEl.metadata.published === false) {
            return false;
          }
        }
        // last verification in case the highest page is actually unpublished
        if (tmpEl && tmpEl.metadata && tmpEl.metadata.published === false) {
          return false;
        }
      }
      if (el && el.metadata && el.metadata.published === false) {
        return false;
      }
      return true;
    });
  }
  else {
    items = await site.orderTree(site.items).filter(function(el) {
      // walk up the tree to ensure no parent is unpublished
      if (el && el.parent != null) {
        let tmpEl = {...el};
        while (tmpEl.parent != null) {
          tmpEl = site.getItemById(tmpEl.parent);
          if (tmpEl && tmpEl.metadata && tmpEl.metadata.published === false) {
            return false;
          }
        }
      }
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
    const doc = parse(`<div id="wrapper">${content}</div>`);
    // work on videos
    const videos = doc.querySelectorAll('video-player,iframe[src*="youtube.com"],iframe[src*="youtube-nocookie.com"],iframe[src*="vimeo.com"],video[src],video source[src],a11y-media-player');
    for await (const el of videos) {
      let urlData = {};
      let videoId = false;
      // ensure we have valid source/src data to draw from
      if (el.getAttribute('source')) {
        if (el.getAttribute('source').includes("https://")) {
          urlData = new URL(el.getAttribute('source'));
        }
        else {
          let tmp = new URL(siteLocation);
          urlData = new URL(tmp.origin + el.getAttribute('source'));
        }
      }
      else if (el.getAttribute('src')) {
        if (el.getAttribute('src').includes("https://") || el.getAttribute('src').includes("http://")) {
          urlData = new URL(el.getAttribute('src'));
        }
        else {
          let tmp = new URL(siteLocation);
          urlData = new URL(tmp.origin + el.getAttribute('src'));
        }
      }
      if (urlData.origin) {
        // support the 3 variations of youtube link
        switch (urlData.origin) {
          case 'https://www.youtube-nocookie.com':
          case 'https://www.youtube.com':
            if (urlData?.searchParams?.v) {
              videoId = urlData.searchParams.v;
            }
            else if (urlData.pathname.startsWith('/embed/')) {
              videoId = urlData.pathname.replace('/embed/', '');
              videoId = `https://www.youtube-nocookie.com/embed/${videoId}`;
            }
          break;
          case 'https://youtu.be':
            videoId = urlData.pathname.replace('/', '');
            videoId = `https://www.youtube-nocookie.com/embed/${videoId}`;
          break;
          // its something not youtube so just leave it be
          default:
            videoId = urlData.href;
          break;
        }
      }
      // convert video-player to a valid youtube iframe embed
      if (videoId) {
        let embed = `<div class="responsive-iframe-container">
          <iframe class="responsive-iframe" width="100%" height="100% frameborder="0" src="${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
        </div>`;
        el.replaceWith(embed);
      } else {
        el.remove();
      }
    }
    // work on images
    const images = doc.querySelectorAll('media-image,img,simple-img');
    for await (const el of images) {
      let urlData = {};
      // ensure we have valid source/src data to draw from
      if (el.getAttribute('source')) {
        if (el.getAttribute('source').includes("https://")) {
          urlData = new URL(el.getAttribute('source'));
        }
        else {
          let tmp = new URL(siteLocation);
          urlData = new URL(tmp.origin + el.getAttribute('source'));
        }
      }
      else if (el.getAttribute('src')) {
        if (el.getAttribute('src').includes("https://") || el.getAttribute('src').includes("http://")) {
          urlData = new URL(el.getAttribute('src'));
        }
        else {
          let tmp = new URL(siteLocation);
          urlData = new URL(tmp.origin + el.getAttribute('src'));
        }
      }
      // convert media-image to a valid img tag
      if (urlData.href) {
        let img = `<img src="${urlData.href}" alt="${el.getAttribute('alt') || ''}" />`;
        el.replaceWith(img);
      } else {
        el.remove();
      }
    }
    // work on all tables to ensure that they are not applying styles as that can mess up formatting
    const tables = doc.querySelectorAll('table,tr,td');
    for await (const el of tables) {
      // remove any inline styles
      el.removeAttribute('style');
    }
    // work on links
    // @todo this needs to create a map, look up the matching slug and convert it to a page link
    let siteLocationURL = new URL(siteLocation);
    const links = doc.querySelectorAll('a');
    for await (const el of links) {
      let urlData = {};
      let href = el.getAttribute('href') || '';
      // ensure we have valid href data to draw from
      if (el.getAttribute('href')) {
        urlData = new URL(el.getAttribute('href'), siteLocation);
        if (el.getAttribute('href').includes(siteLocationURL.origin) || el.getAttribute('href').startsWith('/')) {
          // account for full qualified links instead of relative
          urlData = new URL(el.getAttribute('href'), siteLocationURL.origin);
          // looking for drupal path which could have q=whatever for the slug
          if (urlData.searchParams && urlData.searchParams.has('q')) {
            href = urlData.searchParams.get('q').replace('/','-') + '.xhtml';
          }
        }

        // this means the path shows up as a valid slug
        if ([...items].filter(function(item) {
          if (urlData.pathname && item.slug === urlData.pathname.replace('/', '')) {
            return true;
          }
        })) {
          // if we found a match, convert the link to the page link in the book
          href = urlData.pathname.replace('/','-') + '.xhtml';
        }
      }
      // convert relative links to absolute links
      if (href) {
        el.setAttribute('href', href);
      } else {
        el.remove();
      }
    }
    // set back to the innerHTML of the wrapper after doing our processing for links in the content
    content = doc.querySelector('#wrapper').innerHTML;
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
      filename: item.slug.replace('/','-') + '.xhtml',
    });
  }
  return data;
}