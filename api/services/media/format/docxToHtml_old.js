// docxToHtml
import { stdResponse } from "../../../utilities/requestHelpers.js";
import df from 'mammoth';
const { convertToHtml } = df;
import busboy from 'busboy';
import concat from "concat-stream";

export default async function handler(req, res) {
  
  var html = '';
  var buffer = {
    filename: null,
    data: null,
  };
  // this allows mapping document styles to html tags
  var mammothOptions = {
    styleMap: [
        "u => em", // convert underline to emphasis tag
        "strike => del" // convert strike to del tag instead of s
    ]
  };
  const bb = busboy({ headers: req.headers });
  bb.on('file', async (name, file, info) => {
    const { filename, encoding, mimeType } = info;
    if(filename.length > 0 && ['application/octet-stream', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) {
      file.pipe(concat((fileBuffer) => {
        buffer.filename = filename;
        buffer.data = fileBuffer;
      }));
    }
  });
  // file closed / finished
  bb.on('close', async () => {
    if (buffer.data) {
      try {
        html = await convertToHtml({buffer: buffer.data}, mammothOptions)
        .then((result) => {
          return result.value; // The generated HTML
        });
      }
      catch(e) {
        // put in the output
        html = e;
      }
    }
    res = stdResponse(res,
      {
        contents: html,
        filename: buffer.filename,
      }
    );
  });
  bb.on('error', (err) => {
    console.log('docxToHtml: Busboy error event:', err.message);
    res = stdResponse(res, {
      error: `File upload error: ${err.message}`,
      contents: '',
      filename: null,
    });
  });
  
  req.pipe(bb);
}
