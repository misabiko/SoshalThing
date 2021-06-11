import {PageInfo} from './pageinfo'
import {h} from 'vue'

export class PixivFollowPage extends PageInfo {
	pageNum : number
	lastPage : number
	csrfToken : string

	activatorSelector = '.menu-items'

	constructor(css : string) {
		super(css, {
			default: `#js-mount-point-latest-following, nav.column-order-menu, nav.column-menu.folder-menu, footer._classic-footer, .ad-footer {display: none;} #wrapper, .layout-body, #wrapper #favviewer {width: 100%; height: 100%}`,
			fullscreen: `nav.column-menu, h1.column-title, div.extaraNavi {display: none;} #wrapper #favviewer {height: 93vh}`,
		})

		const topPaginator = document.querySelector('nav.column-order-menu')
		if (!topPaginator)
			throw "Couldn't find the top paginator"

		this.pageNum = parseInt(topPaginator.querySelector('.page-list > li.current')?.textContent || '1') - 1
		this.lastPage = 100

		this.csrfToken = (globalThis as any).pixiv.context.token
	}

	inject() {
		const topPaginator = document.querySelector('nav.column-order-menu')
		if (!topPaginator)
			throw "Couldn't find the top paginator"

		topPaginator.after(this.rootDiv)
	}

	activator() {
		return h('li', super.activator())
	}
}

export class PixivUserPage extends PageInfo {
	pageNum! : number
	lastPage! : number

	defaultViewMode = 'fullscreen'
	activatorClassNames? : string
	activatorSelector = 'nav'

	constructor(css: string) {
		super(css, {
			default: `#favviewer {width: 100%; height: 50%}`,
			fullscreen: `#favviewer ~ div {display: none;`
		})
	}

	async waitUntilInjectable() : Promise<void> {
		if (document.readyState !== "complete")
			return new Promise((resolve, reject) => {
				document.addEventListener('DOMContentLoaded', () => resolve(), {once: true})
				document.addEventListener('load', () => resolve(), {once: true})
				window.setTimeout(() => {
					if (document.getElementsByTagName('nav')[0]) {
						console.warn("DOMContentLoaded timed out, but DOM is ready.")
						resolve()
					}
					else
						reject("DOMContentLoaded timed out.")
				}, 3000)
			})
	}

	inject() {
		console.log((document.body as any).innerHtml)

		const nav = document.getElementsByTagName('nav')[0]
		this.activatorClassNames = nav.lastElementChild?.className || ''

		const navGrandpa = nav.parentElement?.parentElement
		if (!navGrandpa)
			throw "Couldn't find the nav grand-parent."

		navGrandpa.after(this.rootDiv)

		const {pageNum, lastPage} = PixivUserPage.getPageNums(document)
		this.pageNum = pageNum
		this.lastPage = lastPage
	}

	static getPageNums(page : Document | HTMLHtmlElement) : { pageNum : number, lastPage : number } {
		const result = {pageNum: 0, lastPage: 0}

		const paginator = page.querySelector('#favviewer')?.nextElementSibling?.nextElementSibling
		if (!paginator)
			throw "Couldn't find paginator"

		const pageNumStr = paginator.querySelector('div')?.textContent
		if (!pageNumStr)
			throw "Couldn't parse pageNum"

		result.pageNum = parseInt(pageNumStr) - 1

		const lastPageStr = paginator.children[paginator.children.length - 2].textContent
		if (!lastPageStr)
			throw "Couldn't parse lastPage"

		result.lastPage = parseInt(lastPageStr) - 1

		return result
	}

	activator() {
		return h('a', {
			id: 'favvieweractivator',
			class: this.activatorClassNames,
		}, 'Activate Soshal')
	}
}

export default [
	{
		pageInfo: PixivFollowPage,
		urlRegex: /https:\/\/.*pixiv\.net\/bookmark_new_illust\.php/,
		urlMatch: "https://*pixiv.net/bookmark_new_illust.php*",
	},
	{
		pageInfo: PixivUserPage,
		urlRegex: /https:\/\/.*pixiv\.net\/.+\/users\/.+\/artworks/,
		urlMatch: "https://*pixiv.net/*/users/*/artworks*",
	},
]