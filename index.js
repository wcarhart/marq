const fs = require('fs')
const path = require('path')
const util = require('util')

class Marq {
	constructor(options) {
		if (options === undefined) {
			options = {
				mode: 'extended',
				cssPrefix: 'marq-',
				cssSuffix: '',
				snippetDir: 'snippets',
				cssDir: 'css',
				jsDir: 'js',
				placeholder: path.join(__dirname, 'blank.png'),
				slideshowScript: path.join(__dirname, 'js', 'slideshow.js')
			}
		}
		this.mode = options.mode === undefined ? 'extended' : options.mode
		this.cssPrefix = options.cssPrefix === undefined ? 'marq-' : options.cssPrefix
		this.cssSuffix = options.cssSuffix === undefined ? '' : options.cssSuffix
		this.snippetDir = options.snippetDir === undefined ? 'snippets' : options.snippetDir
		this.cssDir = options.cssDir === undefined ? 'css' : options.cssDir
		this.jsDir = options.jsDir === undefined ? 'js' : options.jsDir
		this.placeholder = options.placeholder === undefined ? path.join(__dirname, 'blank.png') : options.placeholder
		this.slideshowScript = options.slideshowScript === undefined ? path.join(__dirname, this.jsDir, 'slideshow.js') : options.slideshowScript

		this.validate()
	}

	// validate Marq object
	validate() {
		// this.mode must be one of supported modes
		const SUPPORTED_MODES = ['gfmd', 'extended']
		if (!SUPPORTED_MODES.includes(this.mode)) {
			throw Error(`Invalid marq: unsupported mode, must be one of: ${SUPPORTED_MODES}`)
		}

		// this.cssPrefix and this.cssSuffix don't have any validation

		// this.snippetDir must exist
		if (!this.snippetDir.startsWith('/')) {
			this.snippetDir = path.join(__dirname, this.snippetDir)
		}
		try {
			fs.statSync(this.snippetDir).isDirectory()
		} catch (e) {
			throw Error(`Invalid marq: no such snippetDir '${this.snippetDir}'`)
		}

		// this.cssDir must exist
		if (!this.cssDir.startsWith('/')) {
			this.cssDir = path.join(__dirname, this.cssDir)
		}
		try {
			fs.statSync(this.cssDir).isDirectory()
		} catch (e) {
			throw Error(`Invalid marq: no such cssDir '${this.cssDir}'`)
		}

		// this.jsDir must exist
		if (!this.jsDir.startsWith('/')) {
			this.jsDir = path.join(__dirname, this.jsDir)
		}
		try {
			fs.statSync(this.jsDir).isDirectory()
		} catch (e) {
			throw Error(`Invalid marq: no such jsDir '${this.jsDir}'`)
		}
	}

	// make sure tables start and end with '|'
	validateTableRow(row, lineNumber, page) {
		if (row[0] !== '|' || row[row.length-1] !== '|') {
			throw new Error(`Invalid table row in '${page}' (line ${lineNumber}): line does not start and end with '|'`)
		}
	}

	// make sure table configs are valid
	validateTableConfigs(configs, lineNumber, page) {
		let isConfig = configs.reduce((result, tc) => { return Boolean(/^:?-+:?$/.exec(tc.trim())) && result }, true)
		if (isConfig === false) {
			throw new Error(`Invalid table row in '${page}' (line ${lineNumber}): invalid table configuration`)
		}
	}

	// add an slide to a slideshow
	buildSlideshowSlide(line, index, page, lineNumber) {
		// parse HTML snippets
		let slideSnippet = path.join(this.snippetDir, 'slideshow/slide.html')
		let dotSnippet = path.join(this.snippetDir, 'slideshow/dot.html')
		let snip
		try {
			for (snip of [slideSnippet, dotSnippet]) {
				let stat = fs.statSync(snip)
				if (!stat.isFile()) {
					throw Error()
				}
			}
		} catch (e) {
			throw Error(`No such snippet: ${snip}`)
		}
		slideSnippet = fs.readFileSync(slideSnippet).toString()
		dotSnippet = fs.readFileSync(dotSnippet).toString()

		// slideshow lines should be in the form of links
		// for example, [image caption](www.example.com/myimage)
		let slide = null, dot = null
		line = line.trim()
		if (/\[.*?\]\(.+?\)/.exec(line)) {
			let match = /\[.*?\]\(.+?\)/.exec(line)[0]
			let caption = match.replace(/^\[/, '').replace(/\].*$/, '')
			let href = match.replace(/^.*\(/, '').replace(/\)$/, '')
			let alt = `Inline slideshow, slide ${index}`
			if (caption !== '') {
				alt = caption
			}
			slide = slideSnippet.replace('{{slide-caption}}', caption).replace('{{slide-content}}', href).replace('{{slide-alt}}', alt)
			dot = dotSnippet.replace('{{slide-index}}', index)
		} else {
			throw new Error(`Invalid slideshow slide in '${page}' (line ${lineNumber}): invalid slide format, expecting [caption](image_url)`)
		}
		
		return [slide, dot]
	}

	// build table HTML
	buildTable(headers, configs, rows, page) {
		// parse HTML snippets
		let tableSnippet = path.join(this.snippetDir, 'table/table.html')
		let theadSnippet = path.join(this.snippetDir, 'table/thead.html')
		let trSnippet = path.join(this.snippetDir, 'table/tr.html')
		let thSnippet = path.join(this.snippetDir, 'table/th.html')
		let tbodySnippet = path.join(this.snippetDir, 'table/tbody.html')
		let tdSnippet = path.join(this.snippetDir, 'table/td.html')
		let snip
		try {
			for (snip of [tableSnippet, theadSnippet, trSnippet, thSnippet, tbodySnippet, tdSnippet]) {
				let stat = fs.statSync(snip)
				if (!stat.isFile()) {
					throw Error()
				}
			}
		} catch (e) {
			throw Error(`No such snippet: ${snip}`)
		}
		tableSnippet = fs.readFileSync(tableSnippet).toString()
		theadSnippet = fs.readFileSync(theadSnippet).toString()
		trSnippet = fs.readFileSync(trSnippet).toString()
		thSnippet = fs.readFileSync(thSnippet).toString()
		tbodySnippet = fs.readFileSync(tbodySnippet).toString()
		tdSnippet = fs.readFileSync(tdSnippet).toString()

		// verify table is sized properly
		//  - all data rows must have same number of cols
		//  - configs and all rows must have same number of cols
		//  - if table has headers, headers, configs, and all rows must have same number of cols
		let rowColumnCounts = rows.reduce((result, row) => { return result.includes(row.length) ? result : result.concat(row.length) }, [])
		if (rowColumnCounts.length !== 1) {
			throw new Error(`Invalid markdown: invalid table in '${page}', unequal columns found in table data`)
		}
		rowColumnCounts = rowColumnCounts[0]
		if (headers.length !== 0) {
			if (headers.length !== configs.length && configs.length !== rowColumnCounts) {
				throw new Error(`Invalid markdown: invalid table in '${page}', unequal table headers, configurations, and rows`)
			}
		} else {
			if (configs.length !== rowColumnCounts) {
				throw new Error(`Invalid markdown: invalid table in '${page}', unequal table configurations and rows`)
			}
		}

		// build html templates
		let table = tableSnippet
		let headerRow = ''
		let bodyRows = []

		// determine column alignments
		let columnAligns = configs.map(col => {
			switch(col) {
				case '-':
				case ':-':
					return 'left'
				case ':-:':
					return 'center'
				case '-:':
					return 'right'
			}
		})
		
		// compute colspan for each header
		let colspan = 1
		let previous = null
		let headerMap = []
		for (let [index, header] of headers.entries()) {
			if (previous === null) {
				previous = header
				continue
			}
			if (previous === header) {
				colspan += 1
			} else {
				headerMap.push([previous, colspan])
				previous = header
				colspan = 1
			}
			if (index === headers.length - 1) {
				headerMap.push([previous, colspan])
			}
		}

		// build optional header row
		headerRow = trSnippet.replace(
			'{{row}}',
			headerMap.map((elements, i) => {
				return thSnippet
					.replace('{{header-align}}', columnAligns[i])
					.replace('{{colspan}}', elements[1])
					.replace('{{header}}', elements[0])
			}).join('\n')
		)

		// build body rows
		for (let row of rows) {
			// append row to body
			bodyRows.push(trSnippet.replace(
				'{{row}}',
				row.map((col, i) => {
					return tdSnippet
						.replace('{{data-align}}', columnAligns[i])
						.replace('{{data}}', col)
				}).join('\n')
			))
		}

		// construct table
		table = table
			.replace(
				'{{table-headers}}',
				theadSnippet.replace('{{headers}}', headerRow)
			)
			.replace(
				'{{table-rows}}',
				tbodySnippet.replace('{{body}}', bodyRows.join('\n'))
			)
		return table
	}

	// build markdown subcomponents for each line
	buildSubcomponents(text) {
		// parse HTML snippets
		let inlineCodeSnippet = path.join(this.snippetDir, 'inline-code.html')
		try {
			let stat = fs.statSync(inlineCodeSnippet)
			if (!stat.isFile()) {
				throw Error()
			}
		} catch (e) {
			throw Error(`No such snippet: ${inlineCodeSnippet}`)
		}
		inlineCodeSnippet = fs.readFileSync(inlineCodeSnippet).toString()

		// build components
		let subcomponent = text

		// this is a little tricky
		// we need to handle plaintext '<', '>', and '$', which can interfere with HTML
		// we want to replace '<', '>', and '$', except in HTML chunks, unless the HTML chunk is in an inline code chunk

		// first, segment subcomponent based on inline code chunks
		let codeSegments = []
		let startIndex = 0
		for (let match of [...subcomponent.matchAll(/`.+?`/g)]) {
			codeSegments.push(text.slice(startIndex, match['index']))
			codeSegments.push(match[0])
			startIndex = match['index'] + match[0].length
		}
		if (startIndex !== text.length) {
			codeSegments.push(text.slice(startIndex))
		}

		// second, segment subcomponent based on HTML chunks
		let htmlSegments = []
		for (let s of codeSegments) {
			startIndex = 0
			for (let match of [...s.matchAll(/===.+?===/g)]) {
				htmlSegments.push(s.slice(startIndex, match['index']))
				htmlSegments.push(match[0])
				startIndex = match['index'] + match[0].length
			}
			if (startIndex !== s.length) {
				htmlSegments.push(s.slice(startIndex))
			}
		}

		// then, replace '<' and '>' appropriately
		for (let [index, chunk] of htmlSegments.entries()) {
			if (!chunk.startsWith('===') || !chunk.endsWith('===')) {
				htmlSegments[index] = chunk.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\$/g, '&#36;')
			} else {
				htmlSegments[index] = chunk.replace(/^===/, '').replace(/===$/, '')
			}
		}
		subcomponent = htmlSegments.join('')

		// handle links: [...](...)
		while (/\[.+?\]\(.+?\)/.exec(subcomponent)) {
			let match = /\[.+?\]\(.+?\)/.exec(subcomponent)[0]
			let anchor = match.replace(/^\[/, '').replace(/\].*$/, '')
			let href = match.replace(/^.*\(/, '').replace(/\)$/, '')
			let html = ''
			if (/\{\{src:.*\}\}/.exec(match) || /\{\{sys:home\}\}/.exec(match)) {
				html = `<a class="${this.cssPrefix}link${this.cssSuffix}" href="${href}">${anchor}</a>`
			} else {
				html = `<a class="${this.cssPrefix}link${this.cssSuffix}" href="${href}" target="_blank">${anchor}</a>`
			}
			subcomponent = subcomponent.replace(match, html)
		}

		// handle inline code
		while (/`.+?`/.exec(subcomponent)) {
			let match = /`.+?`/.exec(subcomponent)[0]
			let code = match.replace(/`/g, '')
			// we need to replace other special characters so they don't interfere
			code = code.replace(/_/g, '&#95;').replace(/\*/g, '&#42;').replace(/~/g, '&#126;')
			let html = inlineCodeSnippet.replace('{{code}}', code)
			subcomponent = subcomponent.replace(match, html)
		}

		// handle italics: _..._
		// middle of string
		while (/[^A-Za-z0-9"'`]_.+?_[^A-Za-z0-9"'`]/.exec(subcomponent)) {
			let match = /[^A-Za-z0-9"'`]_.+?_[^A-Za-z0-9"'`]/.exec(subcomponent)[0]
			let startChar = match[0]
			let endChar = match[match.length - 1]
			let cleansedMatch = match.substring(1, match.length - 2)
			let italics = cleansedMatch.replace(/^_/, '').replace(/_$/, '')
			subcomponent = subcomponent.replace(match, `${startChar}<i>${italics}</i>${endChar}`)
		}
		// start of string
		while (/^_.+?_[^A-Za-z0-9"'`]/.exec(subcomponent)) {
			let match = /^_.+?_[^A-Za-z0-9"'`]/.exec(subcomponent)[0]
			let endChar = match[match.length - 1]
			let cleansedMatch = match.substring(0, match.length - 2)
			let italics = cleansedMatch.replace(/^_/, '').replace(/_$/, '')
			subcomponent = subcomponent.replace(match, `<i>${italics}</i>${endChar}`)
		}
		// end of string
		while (/[^A-Za-z0-9"'`]_.+?_$/.exec(subcomponent)) {
			let match = /[^A-Za-z0-9"'`]_.+?_$/.exec(subcomponent)[0]
			let startChar = match[0]
			let cleansedMatch = match.substring(1, match.length - 1)
			let italics = cleansedMatch.replace(/^_/, '').replace(/_$/, '')
			subcomponent = subcomponent.replace(match, `${startChar}<i>${italics}</i>`)
		}
		// whole string
		while (/^_.+?_$/.exec(subcomponent)) {
			let match = /^_.+?_$/.exec(subcomponent)[0]
			let italics = match.replace(/^_/, '').replace(/_$/, '')
			subcomponent = subcomponent.replace(match, `<i>${italics}</i>`)
		}

		// handle bold: **...**
		// middle of string
		while (/[^A-Za-z0-9"'`]\*\*.+?\*\*[^A-Za-z0-9"'`]/.exec(subcomponent)) {
			let match = /[^A-Za-z0-9"'`]\*\*.+?\*\*[^A-Za-z0-9"'`]/.exec(subcomponent)[0]
			let startChar = match[0]
			let endChar = match[match.length - 1]
			let cleansedMatch = match.substring(1, match.length - 3)
			let bold = cleansedMatch.replace(/^\*\*/, '').replace(/\*\*$/, '')
			subcomponent = subcomponent.replace(match, `${startChar}<b class="${this.cssPrefix}bold-text${this.cssSuffix}">${bold}</b>${endChar}`)
		}
		// start of string
		while (/^\*\*.+?\*\*[^A-Za-z0-9"'`]/.exec(subcomponent)) {
			let match = /^\*\*.+?\*\*[^A-Za-z0-9"'`]/.exec(subcomponent)[0]
			let endChar = match[match.length - 1]
			let cleansedMatch = match.substring(0, match.length - 3)
			let bold = cleansedMatch.replace(/^\*\*/, '').replace(/\*\*$/, '')
			subcomponent = subcomponent.replace(match, `<b class="${this.cssPrefix}bold-text${this.cssSuffix}">${bold}</b>${endChar}`)
		}
		// end of string
		while (/[^A-Za-z0-9"'`]\*\*.+?\*\*$/.exec(subcomponent)) {
			let match = /[^A-Za-z0-9"'`]\*\*.+?\*\*$/.exec(subcomponent)[0]
			let startChar = match[0]
			let cleansedMatch = match.substring(1, match.length - 2)
			let bold = cleansedMatch.replace(/^\*\*/, '').replace(/\*\*$/, '')
			subcomponent = subcomponent.replace(match, `${startChar}<b class="${this.cssPrefix}bold-text${this.cssSuffix}">${bold}</b>`)
		}
		// whole string
		while (/^\*\*.+?\*\*$/.exec(subcomponent)) {
			let match = /^\*\*.+?\*\*$/.exec(subcomponent)[0]
			let bold = match.replace(/^\*\*/, '').replace(/\*\*$/, '')
			subcomponent = subcomponent.replace(match, `<b class="${this.cssPrefix}bold-text${this.cssSuffix}">${bold}</b>`)
		}

		// handle strikethrough: ~~...~~
		// middle of string
		while (/[^A-Za-z0-9"'`]~~.+?~~[^A-Za-z0-9"'`]/.exec(subcomponent)) {
			let match = /[^A-Za-z0-9"'`]~~.+?~~[^A-Za-z0-9"'`]/.exec(subcomponent)[0]
			let startChar = match[0]
			let endChar = match[match.length - 1]
			let cleansedMatch = match.substring(1, match.length - 3)
			let strikethrough = cleansedMatch.replace(/^~~/, '').replace(/~~$/, '')
			subcomponent = subcomponent.replace(match, `${startChar}<s>${strikethrough}</s>${endChar}`)
		}
		// start of string
		while (/^~~.+?~~[^A-Za-z0-9"'`]/.exec(subcomponent)) {
			let match = /^~~.+?~~[^A-Za-z0-9"'`]/.exec(subcomponent)[0]
			let endChar = match[match.length - 1]
			let cleansedMatch = match.substring(0, match.length - 3)
			let strikethrough = cleansedMatch.replace(/^~~/, '').replace(/~~$/, '')
			subcomponent = subcomponent.replace(match, `<s>${strikethrough}</s>${endChar}`)
		}
		// end of string
		while (/[^A-Za-z0-9"'`]~~.+?~~$/.exec(subcomponent)) {
			let match = /[^A-Za-z0-9"'`]~~.+?~~$/.exec(subcomponent)[0]
			let startChar = match[0]
			let cleansedMatch = match.substring(1, match.length - 2)
			let strikethrough = cleansedMatch.replace(/^~~/, '').replace(/~~$/, '')
			subcomponent = subcomponent.replace(match, `${startChar}<s>${strikethrough}</s>`)
		}
		// whole string
		while (/^~~.+?~~$/.exec(subcomponent)) {
			let match = /^~~.+?~~$/.exec(subcomponent)[0]
			let strikethrough = match.replace(/^~~/, '').replace(/~~$/, '')
			subcomponent = subcomponent.replace(match, `<s>${strikethrough}</s>`)
		}

		return subcomponent
	}

	// resolve marq prefixes and suffixes, additional classes, and id
	resolveAttributes(html, cls, id) {
		let classesToAdd = [cls]
		if (Array.isArray(cls)) {
			classesToAdd = cls
		}
		classesToAdd = classesToAdd.filter(c => c !== '' && c !== undefined && c !== null)

		html = html.replace(/\{\{marq-prefix\}\}/g, this.cssPrefix)
		html = html.replace(/\{\{marq-suffix\}\}/g, this.cssSuffix)
		if (classesToAdd.length === 0) {
			html = html.replace(/\{\{marq-class\}\}/g, '')
		} else {
			html = html.replace(/\{\{marq-class\}\}/g, ` ${classesToAdd.join(' ')}`)
		}
		if (id !== '' && id !== undefined && id !== null) {
			html = html.replace(/\{\{marq-id\}\}/g, ` id="${id}"`)
		} else {
			html = html.replace(/\{\{marq-id\}\}/g, '')
		}

		return html
	}

	// convert markdown to HTML
	convertSync(md, options) {
		if (options === undefined) {
			options = {
				page: '',
				cls: '',
				id: ''
			}
		}
		let page = options.page === undefined ? '' : options.page
		let cls = options.cls === undefined ? '' : options.cls
		let id = options.id === undefined ? '' : options.id
		if (typeof md !== 'string') {
			throw Error('Markdown input must be a string, try converting it with .toString()')
		}

		// parse snippets
		let centeredTextSnippet = path.join(this.snippetDir, 'centered-text.html')
		let blockCodeSnippet = path.join(this.snippetDir, 'block-code.html')
		let shoutoutSnippet = path.join(this.snippetDir, 'shoutout.html')
		let ulSnippet = path.join(this.snippetDir, 'ul.html')
		let olSnippet = path.join(this.snippetDir, 'ol.html')
		let liSnippet = path.join(this.snippetDir, 'li.html')
		let olliSnippet = path.join(this.snippetDir, 'olli.html')
		let imgSnippet = path.join(this.snippetDir, 'img.html')
		let imgSubtitleSnippet = path.join(this.snippetDir, 'img-subtitle.html')
		let youtubeVideoSnippet = path.join(this.snippetDir, 'youtube.html')
		let slideshowSnippet = path.join(this.snippetDir, 'slideshow/slideshow.html')
		let h1Snippet = path.join(this.snippetDir, 'headers/h1.html')
		let h2Snippet = path.join(this.snippetDir, 'headers/h2.html')
		let h3Snippet = path.join(this.snippetDir, 'headers/h3.html')
		let h4Snippet = path.join(this.snippetDir, 'headers/h4.html')
		let h5Snippet = path.join(this.snippetDir, 'headers/h5.html')
		let h6Snippet = path.join(this.snippetDir, 'headers/h6.html')
		let pSnippet = path.join(this.snippetDir, 'p.html')
		let blockquoteSnippet = path.join(this.snippetDir, 'blockquote.html')
		let snip
		try {
			for (snip of [
				centeredTextSnippet, blockCodeSnippet, shoutoutSnippet, pSnippet,
				ulSnippet, olSnippet, liSnippet, olliSnippet, imgSnippet,
				imgSubtitleSnippet, youtubeVideoSnippet, slideshowSnippet,
				h1Snippet, h2Snippet, h3Snippet, h4Snippet, h5Snippet, h6Snippet,
				blockquoteSnippet
			]) {
				let stat = fs.statSync(snip)
				if (!stat.isFile()) {
					throw Error()
				}
			}
		} catch (e) {
			throw Error(`No such snippet: ${snip}`)
		}
		centeredTextSnippet = fs.readFileSync(centeredTextSnippet).toString()
		blockCodeSnippet = fs.readFileSync(blockCodeSnippet).toString()
		shoutoutSnippet = fs.readFileSync(shoutoutSnippet).toString()
		ulSnippet = fs.readFileSync(ulSnippet).toString()
		olSnippet = fs.readFileSync(olSnippet).toString()
		liSnippet = fs.readFileSync(liSnippet).toString()
		olliSnippet = fs.readFileSync(olliSnippet).toString()
		imgSnippet = fs.readFileSync(imgSnippet).toString()
		imgSubtitleSnippet = fs.readFileSync(imgSubtitleSnippet).toString()
		youtubeVideoSnippet = fs.readFileSync(youtubeVideoSnippet).toString()
		slideshowSnippet = fs.readFileSync(slideshowSnippet).toString()
		h1Snippet = fs.readFileSync(h1Snippet).toString()
		h2Snippet = fs.readFileSync(h2Snippet).toString()
		h3Snippet = fs.readFileSync(h3Snippet).toString()
		h4Snippet = fs.readFileSync(h4Snippet).toString()
		h5Snippet = fs.readFileSync(h5Snippet).toString()
		h6Snippet = fs.readFileSync(h6Snippet).toString()
		pSnippet = fs.readFileSync(pSnippet).toString()
		blockquoteSnippet = fs.readFileSync(blockquoteSnippet).toString()

		// convert MD to HTML
		let lines = md.split('\n')
		let html = ''

		// code block state inforamtion
		let inCodeBlock = false
		let codeblock = []
		let codeblockLanguage = ''

		// list state information
		let inUnorderedList = false
		let inOrderedList = false
		let unorderedListItems = []
		let orderedListItems = []
		let orderedListStart = 1

		// table state information
		let inTable = false
		let tableHeaders = []
		let tableConfigs = []
		let tableRows = []

		// HTML block state information
		let inHtmlBlock = false
		let htmlblock = []

		// slideshow state information
		let inSlideshow = false
		let slideshow = []

		for (let [index, line] of lines.entries()) {
			// we'll need to keep track of the state of the markdown
			// valid states:
			//  - in code block
			//  - in HTML block
			//  - in table
			//  - in unordered list
			//  - in ordered list
			//  - in slideshow
			//  - normal

			// normal state
			if (inCodeBlock === false && inHtmlBlock === false && inTable === false && inUnorderedList === false && inOrderedList === false && inSlideshow === false) {

				// lines that start with '#' are titles
				if (line.startsWith('# ')) {
					let text = line.replace(/^# /, '')
					let subcomponent = this.buildSubcomponents(text)
					html += h1Snippet.replace('{{title}}', subcomponent)
				} else if (line.startsWith('## ')) {
					let text = line.replace(/^## /, '')
					let subcomponent = this.buildSubcomponents(text)
					html += h2Snippet.replace('{{title}}', subcomponent)
				} else if (line.startsWith('### ')) {
					let text = line.replace(/^### /, '')
					let subcomponent = this.buildSubcomponents(text)
					html += h3Snippet.replace('{{title}}', subcomponent)
				} else if (line.startsWith('#### ')) {
					let text = line.replace(/^#### /, '')
					let subcomponent = this.buildSubcomponents(text)
					html += h4Snippet.replace('{{title}}', subcomponent)
				} else if (line.startsWith('##### ')) {
					let text = line.replace(/^##### /, '')
					let subcomponent = this.buildSubcomponents(text)
					html += h5Snippet.replace('{{title}}', subcomponent)
				} else if (line.startsWith('###### ')) {
					let text = line.replace(/^###### /, '')
					let subcomponent = this.buildSubcomponents(text)
					html += h6Snippet.replace('{{title}}', subcomponent)

				// lines that start with '>>' are interpreted to be shoutouts
				} else if (line.startsWith('>> ')) {
					let shoutout = line.replace(/^>> /, '')
					let components = shoutout.split(' | ')
					let shoutoutTitle = components.shift()
					let shoutoutText = components.join(' | ')
					shoutoutTitle = this.buildSubcomponents(shoutoutTitle)
					shoutoutText = this.buildSubcomponents(shoutoutText)
					html += shoutoutSnippet.replace('{{title}}', shoutoutTitle).replace('{{text}}', shoutoutText)

				// lines that start with '*' are interpreted to be unordered lists
				}  else if (line.startsWith('* ')) {
					inUnorderedList = true
					let text = line.replace(/^\* /, '')
					unorderedListItems.push(text)

				// lines that start with \d. are interpreted to be ordered lists
				} else if (/^\d+\./.exec(line)) {
					if (inOrderedList === false) {
						orderedListStart = Number(line.replace(/\..*$/, ''))
					}
					inOrderedList = true
					let text = line.replace(/^\d+\.\s*/, '')
					orderedListItems.push(text)

				// lines that start with '!' are interpreted to be images
				} else if (line.startsWith('![')) {
					// we have to be careful here - must be lazy and not greedy - what if <.*> contains ']' or ')'?
					let imgAlt = line.replace(/^!\[/, '').replace(/\].*?$/, '')
					let imgSrc = line.replace(/^.*?\(/, '').replace(/\).*?$/, '')
					let remaining = line.replace(/^!\[.*?\]\(.*?\)/, '')
					let subtitleText = ''
					if (remaining[0] === '<' && remaining[remaining.length-1] === '>') {
						subtitleText = line.replace(/^.*</, '').replace(/>$/, '')
						subtitleText = this.buildSubcomponents(subtitleText)
					}
					let imgSubtitle = imgSubtitleSnippet.replace('{{subtitle}}', subtitleText)
					html += imgSnippet.replace('{{alt}}', imgAlt).replace('{{src}}', imgSrc).replace('{{img-subtitle}}', imgSubtitle)

				// lines that start with '~' are interpreted to be YouTube vides
				} else if (line.startsWith('~(')) {
					let videoId = line.replace(/^~\(/, '').replace(/\)$/, '')
					html += youtubeVideoSnippet.replace(/\{\{video-id\}\}/g, videoId)

				// lines that are '===' are interpreted to be the start or end of HTML blocks
				} else if (line === '===') {
					inHtmlBlock = true

				// lines that start with '=' are interpreted to be centered
				} else if (line.startsWith('=')) {
					let text = line.replace(/^=/, '')
					let subcomponent = this.buildSubcomponents(text)
					html += centeredTextSnippet.replace('{{text}}', subcomponent)

				// lines that start with '?' are interpretted to be comments and should not be rendered as HTML
				} else if (line.startsWith('?')) {
					continue

				// lines that start with '>' are interpretted to be block quotes
				} else if (line.startsWith('>')) {
					let blockquote = line.replace(/^> /, '')
					let quoteText, quoteCite
					if (blockquote.includes(' | ')) {
						let components = blockquote.split(' | ')
						quoteCite = components.shift()
						quoteText = this.buildSubcomponents(components.join(' | '))
					} else {
						quoteCite = ''
						quoteText = this.buildSubcomponents(blockquote)
					}
					
					let quoteHtml
					if (quoteCite === '') {
						quoteHtml = blockquoteSnippet.replace('{{marq-cite}}', '')
					} else {
						quoteHtml = blockquoteSnippet.replace('{{marq-cite}}', `cite="${quoteCite}"`)
					}
					html += quoteHtml.replace('{{blockquote}}', quoteText)

				// lines that start with '|' are interpretted to be table contents
				} else if (line.startsWith('|')) {
					inTable = true
					let tableComponents = line.split('|')
					this.validateTableRow(line, index, page)
					tableComponents = tableComponents.filter(tc => tc !== '')
					let isConfig = tableComponents.reduce((result, tc) => { return Boolean(/^:?-+:?$/.exec(tc.trim())) && result }, true)
					if (isConfig === false) {
						tableHeaders = tableHeaders.concat(tableComponents.map(tc => tc.trim()))
					} else {
						tableConfigs = tableConfigs.concat(tableComponents.map(tc => tc.trim().replace(/-+/, '-')))
						this.validateTableConfigs(tableConfigs, index, page)
					}

				// lines that are '```' are interpreted to be the start or end of a code block
				} else if (line.startsWith('```')) {
					inCodeBlock = true
					if (line !== '```') {
						codeblockLanguage = line.replace(/^```/, '')
					}

				// lines that are '[[[' are intepreted to be the start of a slideshow
				} else if (line === '[[[') {
					inSlideshow = true

				// lines that are '---' or '___' are interpreted to be horizontal rules
				} else if (line === '---' || line === '___') {
					html += '<hr>'

				// empty lines are interpreted to be line breaks
				} else if (line === '') {
					if (inUnorderedList === true) {
						let listHtml = unorderedListItems.map(li => liSnippet.replace('{{text}}', this.buildSubcomponents(li)))
						html += ulSnippet.replace('{{list-items}}', listHtml.join(''))
						unorderedListItems = []
						inUnorderedList = false
					} else if (inOrderedList === true) {
						let listHtml = orderedListItems.map(olli => olliSnippet.replace('{{text}}', this.buildSubcomponents(olli)))
						html += olSnippet.replace('{{list-items}}', listHtml.join('')).replace('{{ol-start}}', orderedListStart)
						orderedListItems = []
						inOrderedList = false
						orderedListStart = 1
					} else {
						html += '<br>'
					}

				// all other lines are interpreted to be regular content text
				} else {
					let subcomponent = this.buildSubcomponents(line)
					html += pSnippet.replace('{{text}}', subcomponent)
				}

			// in unordered list state
			} else if (inUnorderedList === true) {
				if (line === '') {
					let listHtml = unorderedListItems.map(li => liSnippet.replace('{{text}}', this.buildSubcomponents(li)))
					html += ulSnippet.replace('{{list-items}}', listHtml.join(''))
					unorderedListItems = []
					inUnorderedList = false
				} else if (line.startsWith('* ')) {
					let text = line.replace(/^\* /, '')
					unorderedListItems.push(text)
				} else {
					throw new Error(`Invalid markdown: unclosed unordered list in '${page}'`)
				}

			// in ordered list state
			} else if (inOrderedList === true) {
				if (line === '') {
					let listHtml = orderedListItems.map(olli => olliSnippet.replace('{{text}}', this.buildSubcomponents(olli)))
					html += olSnippet.replace('{{list-items}}', listHtml.join('')).replace('{{ol-start}}', orderedListStart)
					orderedListItems = []
					inOrderedList = false
					orderedListStart = 1
				} else if (/^\d+\./.exec(line)) {
					let text = line.replace(/^\d+\.\s*/, '')
					orderedListItems.push(text)
				} else {
					throw new Error(`Invalid markdown: unclosed ordered list in '${page}'`)
				}

			// in table state
			} else if (inTable === true) {
				// table ends when we encounter a blank line
				if (line === '') {
					inTable = false
					let tableHtml = this.buildTable(tableHeaders, tableConfigs, tableRows, page)
					html += tableHtml
					tableHeaders = []
					tableConfigs = []
					tableRows = []
				} else {
					if (!line.startsWith('|')) {
						throw new Error(`Invalid table row (line ${index}): did you forget to end the table with an empty newline?`)
					}
					// ignore '|' if inline code
					let tableComponents = line.match(/(?:[^|`]+|`[^`]*`)+/g)
					this.validateTableRow(line, index, page)
					tableComponents = tableComponents.filter(tc => tc !== '')
					if (tableConfigs.length === 0) {
						tableConfigs = tableConfigs.concat(tableComponents.map(tc => tc.trim().replace(/-+/, '-')))
						this.validateTableConfigs(tableConfigs, index, page)
					} else {
						tableRows.push(tableComponents.map(tc => { return this.buildSubcomponents(tc) }))
					}
				}

			// in code block state
			} else if (inCodeBlock === true) {
				// if we encounter another '```', close the code block
				if (line === '```') {
					inCodeBlock = false
					codeblock = codeblock.map(b => b.replace('<', '&lt;').replace('>', '&gt;'))
					if (codeblockLanguage === '') {
						codeblockLanguage = 'nohighlight'
					} else {
						codeblockLanguage = `language-${codeblockLanguage}`
					}
					codeblock = codeblock.join('\n')
					html += blockCodeSnippet.replace('{{code}}', codeblock).replace('{{codeblock-language}}', codeblockLanguage).replace('{{marq-blank-img}}', this.placeholder)
					codeblock = []
					codeblockLanguage = ''
				} else {
					// handle plaintext '<', '>', and '$' which can interfere with HTML
					line = line.replace(/</g, '&lt;')
					line = line.replace(/>/g, '&gt;')
					line = line.replace(/\$/g, '&#36;')

					// append to the code block
					codeblock.push(line)
				}

			// in HTML block state
			} else if (inHtmlBlock === true) {
				// if we encounter another '===', close the HTML block
				if (line === '===') {
					inHtmlBlock = false
					html += htmlblock.join('\n')
					htmlblock = []
				} else {
					// append to the HTML block
					htmlblock.push(line)
				}

			// in slideshow
			} else if (inSlideshow === true) {
				// if we encounter ']]]', close the slideshow
				if (line === ']]]') {
					inSlideshow = false
					html += slideshowSnippet.replace('{{slides}}', slideshow.map(s => s[0]).join('\n')).replace('{{dots}}', slideshow.map(s => s[1]).join('\n')).replace('{{marq-slideshow-script}}', this.slideshowScript)
					slideshow = []
				} else {
					// append to the slideshow
					slideshow.push(this.buildSlideshowSlide(line, slideshow.length + 1, page, index))
				}

			// error state
			} else {
				throw new Error('Ambiguous markdown state: in table, code block, unordered list, ordered list, slideshow, or HTML block at the same time')
			}
		}

		// handle invalid markdown cases
		if (inCodeBlock) {
			throw new Error(`Invalid markdown: unclosed code block in '${page}'`)
		}
		if (inUnorderedList) {
			throw new Error(`Invalid markdown: unclosed unordered list in '${page}'`)
		}
		if (inOrderedList) {
			throw new Error(`Invalid markdown: unclosed ordered list in '${page}'`)
		}
		if (inTable) {
			throw new Error(`Invalid markdown: unclosed table in '${page}', did you forget to end the table with an empty newline?`)
		}
		if (inSlideshow) {
			throw new Error(`Invalid markdown: unclosed slideshow in '${page}'`)
		}

		html = this.resolveAttributes(html, cls, id)
		return html
	}

	convert(md, options) {
		return new Promise((resolve, reject) => {
			try {
				let result = this.convertSync(md, options)
				resolve(result)
			} catch (e) {
				reject(e)
			}
		})
	}
}

module.exports = {
	Marq
}