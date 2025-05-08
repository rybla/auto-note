import RssParser from "rss-parser";

export function from_RssItem_to_FeedItem(
  args: { feed_url: string; feed_title: string },
  item: RssParser.Item,
): FeedItem {
  return {
    feed_url: args.feed_url,
    feed_title: args.feed_title,
    link: item.link!,
    pubDate: item.pubDate!,
    title: item.title!,
    summary: item.summary,
    content: item.content!,
    categories: item.categories,
  };
}

export type FeedItem = {
  feed_url: string;
  feed_title: string;
  link: string;
  pubDate: string;
  title: string;
  summary?: string;
  content: string;
  categories?: string[];
};

export function from_FeedItem_to_FeedItemSummarized(
  args: { summary: string },
  item: FeedItem,
): SummarizedFeedItem {
  return {
    feed_url: item.feed_url,
    feed_title: item.feed_title,
    link: item.link,
    pubDate: item.pubDate,
    title: item.title,
    summary: args.summary,
    categories: item.categories,
  };
}

export type SummarizedFeedItem = Omit<
  FeedItem & {
    summary: string;
  },
  "content"
>;
