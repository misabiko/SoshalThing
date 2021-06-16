import {HostPageService, PagedEndpoint, Payload, Service} from '@/services'
import {PageInfo} from '@/hostpages/pageinfo'
import {PixivBookmarkPage, PixivFollowPage, PixivPage, PixivUserPage} from '@/hostpages/pixiv'
import PixivComponent from '@/components/Articles/PixivArticle.vue'
import {Article, getImageFormat, ImageData, LazyMedia, MediaArticle, MediaLoadStatus} from '@/data/articles'
import {reactive} from 'vue'

export interface PixivArticle extends Article, MediaArticle {
	title : string
	media : [LazyMedia]
	liked : boolean
	bookmarked : boolean
}

export class PixivService extends Service<PixivArticle> implements HostPageService {
	pageInfo? : PixivPage

	constructor(pageInfoObj? : PageInfo) {
		super('Pixiv', PixivComponent, true)

		if (pageInfoObj instanceof PixivPage)
			this.pageInfo = pageInfoObj

		this.endpoints.push(
			new FollowPageEndpoint(this.pageInfo instanceof PixivFollowPage ? this.pageInfo : undefined),
			new UserPageEndpoint(this.pageInfo instanceof PixivUserPage ? this.pageInfo : undefined),
			new BookmarkPageEndpoint(this.pageInfo instanceof PixivBookmarkPage ? this.pageInfo : undefined),
		)
	}

	initialTimelines(serviceIndex : number) {
		switch (this.pageInfo?.constructor) {
			case PixivFollowPage:
				return [
					{
						title: 'Following',
						serviceIndex,
						endpointIndex: 0,
						container: 'MasonryContainer',
						defaults: {
							rtl: false,
						},
					},
				]
			case PixivUserPage:
				return [
					{
						title: 'User',
						serviceIndex,
						endpointIndex: 1,
						container: 'MasonryContainer',
						defaults: {
							rtl: false,
						},
					},
				]
			case PixivBookmarkPage:
				return [
					{
						title: 'Bookmarks',
						serviceIndex,
						endpointIndex: 2,
						container: 'MasonryContainer',
						defaults: {
							rtl: false,
						},
					},
				]
			default: return []
		}
	}

	getAPIArticleData(id : string) : Promise<any> {
		return Promise.resolve(undefined)
	}

	getExternalLink(id : string) : string {
		return 'https://www.pixiv.net/en/artworks/' + id
	}

	async like(id : string) {
		if (!(this.pageInfo instanceof PixivFollowPage))
			return

		const response : LikeResponse = await fetch('https://www.pixiv.net/ajax/illusts/like', {
			method: "POST",
			credentials: "same-origin",
			cache: "no-cache",
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				'X-CSRF-TOKEN': this.pageInfo.csrfToken,
			},
			body: JSON.stringify({illust_id: id}),
		}).then(r => r.json())

		console.dir(response)
		if (response.error) {
			console.error("Error during like: ", response)
			return
		}

		if (response.body.is_liked)
			console.log(id + ' was already liked.')
		else
			console.log('Liked ' + id)

		this.articles[id].liked = true
	}

	async bookmark(id : string, priv: boolean) {
		if (!(this.pageInfo instanceof PixivFollowPage))
			return

		const response : BookmarkResponse = await fetch('https://www.pixiv.net/ajax/illusts/bookmarks/add', {
			method: "POST",
			credentials: "same-origin",
			cache: "no-cache",
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json",
				"Cache-Control": "no-cache",
				'X-CSRF-TOKEN': this.pageInfo.csrfToken,
			},
			body: JSON.stringify({
				illust_id: id,
				restrict: priv ? 1 : 0,
				comment: "",
				tags: [],
			}),
		}).then(r => r.json())

		console.dir(response)
		if (response.error) {
			console.error("Error during bookmark: ", response)
			return
		}

		console.log('Bookmarked ' + id)

		this.articles[id].bookmarked = true
	}
}

type LikeResponse = {
	body : { is_liked : boolean }
	error : boolean
	message : string
}

type BookmarkResponse = {
	error : boolean,
	message : string,
	body : {
		last_bookmark_id : string,
		stacc_status_id : any
	}
}

type ThumbData = {
	id : string
	title : string
	thumbnail : ImageData
	bookmarked : boolean
}

interface MountPointData {
	url : string
	illustId : string
	illustTitle : string
	illustType : string
	pageCount : number
	tags : string[]
	width : number
	height : number
	userId : string
	userImage : any
	userName : string
	bookmarkCount : number
	isBookmarkable : boolean
	isBookmarked : boolean
	isPrivateBookmark : boolean
	responseCount : number
}

interface FollowPageInstanceOpt {

}

interface FollowPageCallOpt extends FollowPageInstanceOpt {
	pageNum : number
}

class FollowPageEndpoint extends PagedEndpoint<FollowPageInstanceOpt, FollowPageCallOpt> {
	static defaultLastPage = 100

	constructor(readonly pageInfo? : PixivFollowPage) {
		super('Following')

		if (pageInfo) {
			const key = this.optionsToInstance({})
			this.instances[key] = {
				articles: [],
				basePageNum: pageInfo.pageNum,
				loadedPages: [],
				lastPage: FollowPageEndpoint.defaultLastPage,
			}
		}
	}

	async call(options : FollowPageCallOpt) {
		console.log('Loading page ' + options.pageNum)

		const wrappedPayload = {
			payload: options.pageNum === this.pageInfo?.pageNum ?
				FollowPageEndpoint.loadCurrentPageArticles() :
				await FollowPageEndpoint.loadPageArticles(options.pageNum),
			basePageNum: this.pageInfo?.pageNum || 0,
			lastPage: FollowPageEndpoint.defaultLastPage,
		}

		this.updateInstance(options, wrappedPayload)

		return wrappedPayload.payload
	}

	initOptions() : FollowPageInstanceOpt {
		return {}
	}

	private static loadCurrentPageArticles() {
		return FollowPageEndpoint.parsePageArticles(document)
	}

	private static async loadPageArticles(pageNum : number) {
		let url = 'https://www.pixiv.net/bookmark_new_illust.php'
		if (pageNum)
			url += '?p=' + (pageNum + 1)

		const htmlEl = document.createElement('html')
		htmlEl.innerHTML = await fetch(url).then(response => response.text())

		return FollowPageEndpoint.parsePageArticles(htmlEl)
	}

	private static parsePageArticles(page : Document | HTMLHtmlElement) : Payload {
		const articles : PixivArticle[] = []
		const newArticles = []

		const currPageStr = page.querySelector('nav.column-order-menu .current')?.textContent
		if (!currPageStr)
			throw "Couldn't find paginator"

		const pageNum = parseInt(currPageStr) - 1

		const rawThumbs = page.querySelector("#js-mount-point-latest-following")?.getAttribute("data-items")
		if (!rawThumbs)
			throw "Couldn't find image datas"
		const thumbs : MountPointData[] = JSON.parse(rawThumbs)

		for (const [i, thumb] of thumbs.entries()) {
			let fullImageUrlSplit = thumb.url.split('/')
			fullImageUrlSplit.splice(3, 2)

			articles.push({
				id: thumb.illustId,
				title: thumb.illustTitle,
				index: pageNum * 20 + i,
				media: [{
					status: MediaLoadStatus.ReadyToLoad,
					thumbnail: {
						url: thumb.url,
						size: {width: thumb.width, height: thumb.height},
						format: getImageFormat(thumb.url),
					},
					content: {
						url: fullImageUrlSplit.join('/'),
						size: {width: thumb.width, height: thumb.height},
						format: getImageFormat(thumb.url),
					},
				}],
				hidden: false,
				queried: false,
				liked: false,
				bookmarked: thumb.isBookmarked || thumb.isPrivateBookmark,
			})
			newArticles.push(thumb.illustId)
		}

		console.log(`Loading ${articles.length} new articles with ${newArticles.length} in timeline.`)
		return {articles, newArticles}
	}

	private static parseThumb(thumb : HTMLDivElement) : ThumbData {
		const id = thumb.querySelector('.thumbnail-menu > div:first-child')?.getAttribute('data-id')
		if (!id)
			throw "Couldn't find id"

		const title = thumb.querySelector('figcaption a')?.textContent
		if (!title)
			throw "Couldn't find title for " + id

		const image = (thumb.querySelector('a > .lazyloaded') as HTMLDivElement)
		const imageUrl = image.style.backgroundImage.slice(5, -2)

		const svg = thumb.querySelector('svg')
		if (!svg)
			throw "Couldn't find svg in thumb"

		return {
			id,
			title,
			thumbnail: {
				url: imageUrl,
				size: {width: parseInt(image.style.width), height: parseInt(image.style.height)},
				format: getImageFormat(imageUrl),
			},
			bookmarked: getComputedStyle(svg).color === "rgb(255, 64, 96)"
		}
	}

	initInstance() {
		if (this.pageInfo)
			return {
				articles: reactive([]),
				loadedPages: [],
				basePageNum: this.pageInfo.pageNum,
				lastPage: this.pageInfo.lastPage,
			}
		else
			return super.initInstance()
	}
}

interface UserPageInstanceOpt {

}

interface UserPageCallOpt extends UserPageInstanceOpt {
	pageNum : number
}

class UserPageEndpoint extends PagedEndpoint<UserPageInstanceOpt, UserPageCallOpt> {
	static defaultLastPage = 100

	constructor(readonly pageInfo? : PixivUserPage) {
		super('User')

		if (pageInfo) {
			const key = this.optionsToInstance({})
			this.instances[key] = {
				articles: [],
				basePageNum: pageInfo.pageNum,
				loadedPages: [],
				lastPage: UserPageEndpoint.defaultLastPage,
			}
		}
	}

	async call(options : UserPageCallOpt) {
		console.log('Loading page ' + options.pageNum)

		const wrappedPayload = {
			payload: options.pageNum === this.pageInfo?.pageNum ?
				UserPageEndpoint.loadCurrentPageArticles() :
				{articles: [], newArticles: []},
			basePageNum: this.pageInfo?.pageNum || 0,
			lastPage: UserPageEndpoint.defaultLastPage,
		}

		this.updateInstance(options, wrappedPayload)

		return wrappedPayload.payload
	}

	initOptions() : UserPageInstanceOpt {
		return {}
	}

	private static loadCurrentPageArticles() {
		return UserPageEndpoint.parsePageArticles(document)
	}

	private static parsePageArticles(page : Document | HTMLHtmlElement) : Payload {
		const articles : PixivArticle[] = []
		const newArticles = []

		const {pageNum} = PixivUserPage.getPageNums(page)

		const rawThumbs = document.getElementById('favviewer')?.nextElementSibling?.querySelector('ul')?.children
		if (!rawThumbs)
			throw "Couldn't find thumbs"

		const thumbs : ThumbData[] = [...rawThumbs].map(t => {
			try {
				return this.parseThumb(t.firstElementChild as HTMLDivElement)
			}catch (err) {
				console.error('Failed to parse thumb', t, err)
				return undefined as unknown as ThumbData
			}
		}).filter(t => !!t)

		for (const [i, thumb] of thumbs.entries()) {
			articles.push({
				id: thumb.id,
				title: thumb.title,
				index: pageNum * 48 + i,
				media: [{
					status: MediaLoadStatus.ThumbnailOnly,
					thumbnail: thumb.thumbnail,
				}],
				hidden: false,
				queried: false,
				liked: false,
				bookmarked: thumb.bookmarked
			})
			newArticles.push(thumb.id)
		}

		console.log(`Loading ${articles.length} new articles with ${newArticles.length} in timeline.`)
		return {articles, newArticles}
	}

	private static parseThumb(thumb : HTMLDivElement) : ThumbData {
		const anchor = thumb.firstElementChild?.firstElementChild?.firstElementChild
		if (!anchor)
			throw "Couldn't find thumb anchor"

		const id = anchor.getAttribute('data-gtm-value')
		if (!id)
			throw "Couldn't find id"

		const img = anchor.querySelector('img')
		if (!img)
			throw "Couldn't find thumb img for " + id

		const title = img.alt
		if (!title)
			throw "Couldn't find title for " + id

		const svg = thumb.querySelector('svg')
		if (!svg)
			throw "Couldn't find svg in thumb"

		return {
			id,
			title,
			thumbnail: {
				url: img.src,
				size: {width: 1, height: 1},
				format: getImageFormat(img.src),
			},
			bookmarked: getComputedStyle(svg).color === "rgb(255, 64, 96)"
		}
	}

	initInstance() {
		if (this.pageInfo)
			return {
				articles: reactive([]),
				loadedPages: [],
				basePageNum: this.pageInfo.pageNum,
				lastPage: this.pageInfo.lastPage,
			}
		else
			return super.initInstance()
	}
}

interface BookmarkPageInstanceOpt {
	priv: boolean
}

interface BookmarkPageCallOpt extends BookmarkPageInstanceOpt {
	pageNum : number
}

class BookmarkPageEndpoint extends PagedEndpoint<BookmarkPageInstanceOpt, BookmarkPageCallOpt> {
	constructor(readonly pageInfo? : PixivBookmarkPage) {
		super('Bookmark')

		if (pageInfo) {
			const key = this.optionsToInstance({priv: pageInfo?.priv || false})
			this.instances[key] = {
				articles: [],
				basePageNum: pageInfo.pageNum,
				loadedPages: [],
				lastPage: pageInfo.lastPage,
			}
		}
	}

	async call(options : BookmarkPageCallOpt) {
		console.log('Loading page ' + options.pageNum)

		const wrappedPayload = {
			payload: options.pageNum === this.pageInfo?.pageNum ?
				BookmarkPageEndpoint.loadCurrentPageArticles(this.pageInfo.pageNum) :
				await BookmarkPageEndpoint.loadPageArticles(options.pageNum, options.priv),
			basePageNum: this.pageInfo?.pageNum || 0,
			lastPage: this.pageInfo?.lastPage || this.pageInfo?.pageNum || 0,
		}

		this.updateInstance(options, wrappedPayload)

		return wrappedPayload.payload
	}

	initOptions() : BookmarkPageInstanceOpt {
		return {
			priv: this.pageInfo?.priv || false,
		}
	}

	private static loadCurrentPageArticles(pageNum : number) {
		return BookmarkPageEndpoint.parsePageArticles(document, pageNum)
	}

	private static async loadPageArticles(pageNum : number, priv: boolean) {
		let url = new URL('https://www.pixiv.net/bookmark.php?rest=hide&order=desc')

		if (pageNum)
			url.searchParams.set('p', (pageNum + 1).toString())

		if (priv)
			url.searchParams.set('rest', 'hide')

		const htmlEl = document.createElement('html')
		htmlEl.innerHTML = await fetch(url.toString()).then(response => response.text())

		return BookmarkPageEndpoint.parsePageArticles(htmlEl, pageNum)
	}

	private static parsePageArticles(page : Document | HTMLHtmlElement, pageNum : number) : Payload {
		const articles : PixivArticle[] = []
		const newArticles = []

		const thumbs : ThumbData[] = [...page.querySelectorAll('.display_editable_works .image-item')].map(t => BookmarkPageEndpoint.parseThumb(t as HTMLLIElement))

		for (const [i, thumb] of thumbs.entries()) {
			let fullImageUrlSplit = thumb.thumbnail.url.split('/')
			fullImageUrlSplit.splice(3, 2)

			articles.push({
				id: thumb.id,
				title: thumb.title,
				index: pageNum * 20 + i,
				media: [{
					status: MediaLoadStatus.ReadyToLoad,
					thumbnail: thumb.thumbnail,
					content: {
						url: fullImageUrlSplit.join('/'),
						size: thumb.thumbnail.size,
						format: getImageFormat(thumb.thumbnail.url),
					},
				}],
				hidden: false,
				queried: false,
				liked: false,
				bookmarked: true,
			})
			newArticles.push(thumb.id)
		}

		console.log(`Loading ${articles.length} new articles with ${newArticles.length} in timeline.`)
		return {articles, newArticles}
	}

	private static parseThumb(thumb : HTMLLIElement) : ThumbData {
		const img = thumb.querySelector('img') as HTMLImageElement
		if (!img)
			throw "Couldn't find img"

		const id = img.getAttribute('data-id')
		if (!id)
			throw "Couldn't find id"

		const title = thumb.children[2].firstElementChild?.getAttribute('title')
		if (!title)
			throw "Couldn't find title for " + id

		const src = img.getAttribute('data-src')
		if (!src)
			throw "Couldn't find src"

		return {
			id,
			title,
			thumbnail: {
				url: src,
				size: {width: img.naturalWidth || img.clientWidth || 1, height: img.naturalWidth || img.clientWidth || 1},
				format: getImageFormat(src),
			},
			bookmarked: true
		}
	}

	initInstance() {
		if (this.pageInfo)
			return {
				articles: reactive([]),
				loadedPages: [],
				basePageNum: this.pageInfo.pageNum,
				lastPage: this.pageInfo.lastPage,
			}
		else
			return super.initInstance()
	}
}