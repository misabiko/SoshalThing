//Name is a bit confusing
export interface Article {
	type : ArticleType;
	id : string;
}

export enum ArticleType {
	Post,
	Repost,
	Quote,
}

export type ArticleData = PostData | RepostData;

export interface PostData {
	id : string;
	creationTime : string;
	authorName : string;
	authorHandle : string;
	authorAvatar : string;
	text : string;
	images? : PostImageData[];
	video? : PostVideoData;
	liked : boolean;
	reposted : boolean;
	likeCount : number;
	repostCount : number;
	userMentions? : UserMentionData[];
	rawObject? : any;
}

export interface RepostData {
	id : string;
	repostedId : string;
	creationTime : string;
	reposterName : string;
	reposterHandle : string;
	reposterAvatar : string;
	rawObject? : any;	//TODO Remove these for production
}

export interface QuoteData extends PostData {
	quotedId : string;
}

export interface UserMentionData {
	id : string;
	handle : string;
	name : string;
	//Last index is the actual last index, not the following one like twitter gives
	indices: [number, number];
}

export interface PostImageData {
	url : string;
	sizes : {
		[name : string] : {
			w : number;
			h : number;
			resize : string;
		}
	}
}

export interface PostVideoData extends PostImageData {
	type : string;
	aspectRatio : number[];
	durationMillis? : number;
	variants : PostVideoVariant[];
	autoplay : boolean;
}

export interface PostVideoVariant {
	url : string;
	contentType : string;
	bitrate : number;
}