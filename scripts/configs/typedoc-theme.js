/**
 * Custom TypeDoc markdown theme for E2B SDK reference docs.
 * Cleans up generated markdown for Mintlify compatibility.
 */
const { MarkdownPageEvent } = require('typedoc-plugin-markdown')

function load(app) {
  // listen to the render event
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    // process markdown content
    page.contents = removeMarkdownLinks(
      removeFirstNLines(
        convertH5toH3(removeLinesWithConditions(page.contents)),
        6
      )
    )
  })
}

// makes methods in the sdk reference look more prominent
function convertH5toH3(text) {
  return text.replace(/^##### (.*)$/gm, '### $1')
}

// removes markdown-style links, keeps link text
function removeMarkdownLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
}

function removeFirstNLines(text, n) {
  return text.split('\n').slice(n).join('\n')
}

// removes "Extends", "Overrides", "Inherited from" sections
function removeLinesWithConditions(text) {
  const lines = text.split('\n')
  const filteredLines = []

  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].startsWith('#### Extends') ||
      lines[i].startsWith('###### Overrides') ||
      lines[i].startsWith('###### Inherited from')
    ) {
      // skip this line and the next three
      i += 3
      continue
    }

    if (lines[i].startsWith('##### new')) {
      // avoid promoting constructors
      i += 1
      continue
    }

    filteredLines.push(convertH5toH3(lines[i]))
  }

  return filteredLines.join('\n')
}

module.exports = { load }

