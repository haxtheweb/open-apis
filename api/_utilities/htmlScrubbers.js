import { parse } from 'node-html-parser'

// Shared HTML scrubbers used by import/conversion services
// Keep in sync with the standard HAX stripMSWord behavior.
export function stripMSWord(input) {
  if (typeof input !== 'string') {
    return ''
  }
  // 1. remove line breaks / Mso classes right off the bat
  var output = input
    .split('\n\r')
    .join('\n')
    .split('\r')
    .join('\n')
    .split('\n\n')
    .join('\n')
    .split('\n\n')
    .join('\n')
    .split('\n\n')
    .join('\n')
    .split('\n')
    .join(' ')
    .replace(/( class=(")?Mso[a-zA-Z]+(")?)/g, '')

  // 2. strip Word generated HTML comments
  output = output.replace(/<\!--(\s|.)*?-->/gim, '')
  output = output.replace(/<\!(\s|.)*?>/gim, '')
  // 3. remove tags leave content if any (but NOT span tags yet)
  output = output.replace(
    /<(\/)*(meta|link|title|html|head|body|font|br|\\\\?xml:|xml|st1:|o:|w:|m:|v:)(\s|.)*?>/gim,
    '',
  )
  // Handle spans specially - remove span wrapper but preserve content and nested elements
  output = output.replace(/<span[^>]*>([\s\S]*?)<\/span>/gim, '$1')
  // 4. Remove everything in between and including tags '<style(.)style(.)>'
  var badTags = ['style', 'script', 'applet', 'embed', 'noframes', 'noscript']
  for (var i in badTags) {
    let tagStripper = new RegExp(
      '<' + badTags[i] + '(s|.)*?' + badTags[i] + '(.*?)>',
      'gim',
    )
    output = output.replace(tagStripper, '')
  }
  // 5. remove attributes ' style="..."', align, start and others that we know we dont need
  output = output.replace(/ style='(\s|.)*?'/gim, '')
  output = output.replace(/ style="(\s|.)*?"/gim, '')
  output = output.replace(/ face="(\s|.)*?"/gim, '')
  output = output.replace(/ align=.*? /g, '')
  output = output.replace(/ start='.*?'/g, '')
  // remove line-height; commonly set via html copy and paste in google docs
  output = output.replace(/line-height:.*?\"/g, '"')
  output = output.replace(/line-height:.*?;/g, '')
  // normal font cause... obviously
  output = output.replace(/font-weight:normal;/g, '')
  // text decoration in a link...
  output = output.replace(/text-decoration:none;/g, '')
  // margin clean up that is in point values; only machines make these
  output = output.replace(/margin-.*?:.*?\"/g, '"')
  output = output.replace(/margin-.*?:.*?;/g, '')
  // empty style tags
  output = output.replace(/ style=""/g, '')
  // ID's wont apply meaningfully on a paste
  output = output.replace(/ id="(\s|.)*?"/gim, '')
  // Google Docs ones
  output = output.replace(/ dir="(\s|.)*?"/gim, '')
  output = output.replace(/ role="(\s|.)*?"/gim, '')
  // these are universally true tho so fine to have here
  output = output.replace(/ contenteditable="(\s|.)*?"/gim, '')
  // some medium, box, github and other paste stuff as well as general paste clean up for classes
  // in multiple html primatives
  output = output.replace(/ data-(\s|.)*?"(\s|.)*?"/gim, '')
  output = output.replace(/ class="(\s|.)*?"/gim, '')
  output = output.replace(/<pstyle/gm, '<p style')
  // HIGHLY specific to certain platforms, empty link tag
  output = output.replace(/<a name=\"_GoBack\"><\/a>/gm, '')
  // 7. clean out empty paragraphs and endlines that cause weird spacing
  output = output.replace(/&nbsp;/gm, ' ')
  // start of double, do it twice for nesting
  output = output.replace(/<section>/gm, '<p>')
  output = output.replace(/<\/section>/gm, '</p>')
  output = output.replace(/<p><p>/gm, '<p>')
  output = output.replace(/<p><p>/gm, '<p>')
  // double, do it twice for nesting
  output = output.replace(/<\/p><\/p>/gm, '</p>')
  output = output.replace(/<\/p><\/p>/gm, '</p>')
  // normalize BR's; common from GoogleDocs
  output = output.replace(/<br \/>/gm, '<br/>')
  output = output.replace(/<p><br \/><b>/gm, '<p><b>')
  output = output.replace(/<\/p><br \/><\/b>/gm, '</p></b>')
  // some other things we know not to allow to wrap and
  // some things bold stuff like crazy for some odd reason
  output = output.replace(/<b><p>/gm, '<p>')
  output = output.replace(/<\/p><\/b>/gm, '</p>')
  output = output.replace(/<b>/gm, '<strong>')
  output = output.replace(/<\/b>/gm, '</strong>')
  // clean up in lists because they get messy for no real reason...ever.
  // tables as well
  output = output.replace(/<p style=\".*?\">/gm, '<p>')
  output = output.replace(/<ul style=\".*?\">/gm, '<ul>')
  output = output.replace(/<ol style=\".*?\">/gm, '<ol>')
  output = output.replace(/<li style=\".*?\">/gm, '<li>')
  output = output.replace(/<td style=\".*?\">/gm, '<td>')
  output = output.replace(/<tr style=\".*?\">/gm, '<tr>')
  // drop list wrappers
  output = output.replace(/<li><p>/gm, '<li>')
  output = output.replace(/<\/p><\/li>/gm, '</li>')
  // bold wraps as an outer tag like p can, and on lists
  output = output.replace(/<b><ul>/gm, '<ul>')
  output = output.replace(/<\/ul><\/b>/gm, '</ul>')
  output = output.replace(/<b><ol>/gm, '<ol>')
  output = output.replace(/<\/ol><\/b>/gm, '</ol>')
  // try ax'ing extra spans
  output = output.replace(/<span><p>/gm, '<p>')
  output = output.replace(/<\/p><\/span>/gm, '</p>')
  // empty with lots of space
  output = output.replace(/<p>(\s*)<\/p>/gm, ' ')
  // empty p / more or less empty
  output = output.replace(/<p><\/p>/gm, '')
  output = output.replace(/<p>&nbsp;<\/p>/gm, ' ')
  // br somehow getting through here
  output = output.replace(/<p><br\/><\/p>/gm, '')
  output = output.replace(/<p><br><\/p>/gm, '')

  // whitespace in reverse of the top case now that we've cleaned it up
  output = output.replace(/<\/p>(\s*)<p>/gm, '</p><p>')
  // target and remove hax specific things from output if they slipped through
  output = output.replace(/ data-hax-ray="(\s|.)*?"/gim, '')
  output = output.replace(/ class=""/gim, '')
  output = output.replace(/ class="hax-active"/gim, '')
  output = output.replace(/ contenteditable="(\s|.)*?"/gim, '')
  output = output.replace(/ t="(\s|.)*?"/gim, '')
  // wow do I hate contenteditable and the dom....
  // bold and italic are treated as if they are block elements in a paste scenario
  // 8. check for empty bad tags
  for (var j in badTags) {
    let emptyTagRemove = new RegExp(
      '<' + badTags[j] + '></' + badTags[j] + '>',
      'gi',
    )
    output = output.replace(emptyTagRemove, '')
  }
  output = output.trim()
  return output
}

export function extractBodyHtml(input) {
  if (typeof input !== 'string') {
    return ''
  }
  const parsed = parse(input)
  const body = parsed.querySelector('body')
  if (body && typeof body.innerHTML === 'string' && body.innerHTML.trim() !== '') {
    return body.innerHTML
  }
  return input
}

export function sanitizeUntrustedHtml(input) {
  if (typeof input !== 'string') {
    return ''
  }
  const wrapper = parse(`<div id="hax-sanitize-wrapper">${input}</div>`)
  const root = wrapper.querySelector('#hax-sanitize-wrapper')
  if (!root) {
    return ''
  }
  const blockedTags = [
    'script',
    'style',
    'noscript',
    'object',
    'embed',
    'form',
    'link',
    'meta',
    'base',
  ]
  blockedTags.forEach((selector) => {
    const nodes = root.querySelectorAll(selector)
    nodes.forEach((node) => node.remove())
  })
  const nodes = root.querySelectorAll('*')
  nodes.forEach((node) => {
    const attrs = Object.keys(node.attributes || {})
    attrs.forEach((attr) => {
      const attrLower = String(attr).toLowerCase()
      const value = String(node.getAttribute(attr) || '')
      if (attrLower.startsWith('on') || attrLower === 'style') {
        node.removeAttribute(attr)
      }
      if (
        ['href', 'src', 'xlink:href', 'action', 'formaction'].includes(attrLower) &&
        value.trim().toLowerCase().startsWith('javascript:')
      ) {
        node.removeAttribute(attr)
      }
    })
  })
  return root.innerHTML
}
