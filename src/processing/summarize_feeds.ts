import RssParser from "rss-parser";
import { parseString } from "xml2js";
import fs from "fs/promises";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { JSDOM } from "jsdom";
import * as google from "@google/generative-ai";
import { parseArgs } from "util";
import { batch, do_, fold } from "../utilities";
import {
  assets_dir,
  summaries_catalogue_filename,
  summaries_dir,
} from "@/common/uri";
import sanitize from "sanitize-filename";
import { sleep } from "bun";
import {
  FeedItem,
  SummarizedFeedItem,
  from_FeedItem_to_FeedItemSummarized,
  from_RssItem_to_FeedItem,
} from "@/common/type";

// -----------------------------------------------------------------------------

const feed_batch_size = 5;
const feed_batch_delay = 1000.0;

// -----------------------------------------------------------------------------

/** Extracts feed URLs from an OPML file */
export async function extractFeedUrls(feed_path: string): Promise<string[]> {
  console.log(`Starting to extract feed URLs from: ${feed_path}`);
  try {
    const fileContent = await fs.readFile(feed_path, { encoding: "utf8" });
    console.log(`✅ Successfully read file: ${feed_path}`);

    const result = await new Promise<any>((resolve, reject) => {
      parseString(fileContent, (err, parsedResult) => {
        if (err) {
          reject(err);
        } else {
          resolve(parsedResult);
        }
      });
    });
    console.log("✅ Successfully parsed OPML XML.");

    const feedUrls: string[] = [];

    const collectUrls = (outlines: any[]) => {
      if (!outlines || !Array.isArray(outlines)) {
        return;
      }
      for (const outline of outlines) {
        if (outline.$ && outline.$.xmlUrl) {
          feedUrls.push(outline.$.xmlUrl);
        }
        if (outline.outline) {
          collectUrls(outline.outline);
        }
      }
    };

    if (
      result.opml &&
      result.opml.body &&
      result.opml.body[0] &&
      result.opml.body[0].outline
    ) {
      collectUrls(result.opml.body[0].outline);
    } else {
      console.warn(
        "OPML structure might be different than expected, or no 'outline' elements found in the body.",
      );
    }

    if (feedUrls.length === 0) {
      console.log("❌ No feed URLs found in the OPML file.");
    } else {
      console.log(`✅ Extracted ${feedUrls.length} feed URLs.`);
    }
    return feedUrls;
  } catch (error) {
    console.error(`Error processing OPML file ${feed_path}:`, error);
    return [];
  }
}

/** Extracts feed items from a feed URL */
export async function extractFeedItems(feed_url: string): Promise<FeedItem[]> {
  console.log(`Attempting to fetch RSS items from URL: ${feed_url}`);
  const parser = new RssParser();

  const feed_items: FeedItem[] = [];
  let feed;
  try {
    feed = await parser.parseURL(feed_url);
  } catch (error) {
    console.error(`❌ Error fetching feed from ${feed_url}:`, error);
    return []; // Return an empty array in case of an error
  }
  console.log(
    `✅ Successfully fetched and parsed RSS feed from ${feed_url}. Found ${feed.items.length} items.`,
  );
  for (const item of feed.items) {
    try {
      feed_items.push(
        from_RssItem_to_FeedItem({ feed_url, feed_title: feed.title! }, item),
      );
    } catch (e: any) {
      console.error(
        `❌ Error parsing feed item: ${item.title ?? "unknown-title"}:`,
      );
    }
  }
  return feed_items;
}

/** Extracts the human-readable article content, in Markdown format from the article linked to in the RSS item. */
export async function extractArticleContent(item: FeedItem): Promise<string> {
  console.log(
    `Attempting to extract article content for item: "${item.title}"`,
  );
  if (!item.link) {
    throw new Error(`Item "${item.title}" has no link.`);
  }

  console.log(`Fetching content from URL: ${item.link}`);
  try {
    const response = await fetch(item.link);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${item.link}. Status: ${response.status} ${response.statusText}`,
      );
    }
    const htmlContent = await response.text();
    console.log(
      `✅ Successfully fetched HTML content from ${item.link}. Length: ${htmlContent.length}`,
    );

    console.log("Parsing HTML content with JSDOM...");
    const dom = new JSDOM(htmlContent, {
      url: item.link, // Provide the URL for Readability to resolve relative paths
    });
    console.log("✅ HTML content parsed successfully.");

    console.log("Extracting article using @mozilla/readability...");
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.content) {
      throw new Error(
        `Could not extract readable content for "${item.title}" from ${item.link}.`,
      );
    }
    console.log(
      `✅ Successfully extracted readable content. Title: "${article.title}", Length: ${article.content.length}`,
    );

    console.log("Converting extracted HTML content to Markdown...");
    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(article.content);
    console.log(
      `✅ Successfully converted content to Markdown. Length: ${markdown.length}`,
    );

    return markdown;
  } catch (error: any) {
    throw new Error(
      `❌ Error extracting article content for "${item.title}" from ${item.link}: ${error.message}`,
    );
  }
}

async function summarizeArticle(item: FeedItem): Promise<string> {
  const content = await extractArticleContent(item);
  // console.log(`content:\n\n${content}\n`);
  // return "TODO";
  const ai = new google.GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = ai.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
  const result = await model.generateContent({
    systemInstruction:
      "The user will provide a the content of an article. You must reply with a single sentence that summarizes the main points of the article.",
    contents: [{ role: "user", parts: [{ text: content }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: google.SchemaType.OBJECT,
        properties: {
          summary: {
            type: google.SchemaType.STRING,
            description: "A summary of the article. Must be a single sentence.",
          },
        },
        required: ["summary"],
      },
    },
  });
  const { summary } = JSON.parse(result.response.text());
  return summary;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      feed: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });

  const feed_path = do_(() => {
    const feed_path = values.feed;
    if (feed_path === undefined) {
      console.error("missing argument: --feed <path>");
      process.exit(1);
    } else {
      return feed_path;
    }
  });

  // ---------------------------------------------------------------------------
  // summarize feed items and write to json files

  const feed_urls = await extractFeedUrls(feed_path);
  const feed_items = fold(await Promise.all(feed_urls.map(extractFeedItems)));
  const feed_item_batches = batch(feed_items, feed_batch_size);

  for (let i = 0; i < feed_item_batches.length; i++) {
    const feed_items_batch = feed_item_batches[i];
    console.log(
      `Processing batch ${i + 1} out of ${feed_item_batches.length} with ${feed_items_batch.length} items`,
    );
    await Promise.all(
      feed_items_batch.map(async (item) => {
        try {
          const filename = sanitize(
            `${item.title ?? "unknown-title"} (published ${item.pubDate}).json`,
          );
          const filenames = await fs.readdir(`${assets_dir}/${summaries_dir}`);
          if (filenames.includes(filename)) {
            console.log(
              `⚠️ Already have a summary of article: "${item.title}"`,
            );
            return;
          }

          const item_with_summary: SummarizedFeedItem = await do_(async () => {
            const summary = item.summary;
            if (summary !== undefined) {
              console.log(
                `✅ Successfully used existing summary of article: "${item.title}"`,
              );
              return from_FeedItem_to_FeedItemSummarized({ summary }, item);
            } else {
              const summary = await summarizeArticle(item);
              console.log(
                `✅ Successfully summarized article: "${item.title}"`,
              );
              return from_FeedItem_to_FeedItemSummarized({ summary }, item);
            }
          });

          await fs.writeFile(
            `${assets_dir}/${summaries_dir}/${filename}`,
            JSON.stringify(item_with_summary, null, 4),
            "utf8",
          );
        } catch (error: any) {
          console.error(
            `❌ Error summarizing article "${item.title}":`,
            error.message,
          );
        }
      }),
    );
    await sleep(feed_batch_delay);
  }

  // ---------------------------------------------------------------------------
  // update catalogue

  const filenames = await fs
    .readdir(`${assets_dir}/${summaries_dir}`)
    .then((filenames) =>
      filenames.filter((filename) => filename !== summaries_catalogue_filename),
    );

  const summarized_feed_items: SummarizedFeedItem[] = await Promise.all(
    filenames.map(async (filename) =>
      JSON.parse(await fs.readFile(filename, "utf8")),
    ),
  );

  fs.writeFile(
    `${assets_dir}/${summaries_dir}/${summaries_catalogue_filename}`,
    JSON.stringify(summarized_feed_items),
    "utf8",
  );
}

main();
