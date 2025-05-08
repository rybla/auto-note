import { useEffect, useState } from "react";
import "./Summaries.css";
import { FeedItem, SummarizedFeedItem } from "./common/type";
import { do_ } from "./utilities";
import { summaries_catalogue_filename, summaries_dir } from "./common/uri";

export default function Summaries(props: {}) {
  const [items, modify_items] = useState<SummarizedFeedItem[]>([]);
  useEffect(() => {
    console.log("loading RSS items");
    do_(async () => {
      try {
        const items = await (
          await fetch(`${summaries_dir}/${summaries_catalogue_filename}`)
        ).json();
        modify_items(items);
      } catch (e: any) {
        console.log(`Error fetching catalogue: ${e.toString()}`);
      }
    });
  }, []);

  return (
    <div className="Summaries panel">
      <div className="title">Summaries</div>
      <div className="body">
        <div className="items">
          {items.map((item, i) => (
            <div
              key={`${item.title} (published ${item.pubDate})`}
              className="item"
            >
              <div className="header">
                <a className="title" href={item.link}>
                  {item.title}
                </a>

                <a className="feed_title" href={item.feed_url}>
                  {item.feed_title}
                </a>
              </div>
              <div className="subheader">
                <div className="pubDate">{item.pubDate}</div>
                <div className="categories">
                  {(item.categories ?? []).map((category) => (
                    <div className="category">{category}</div>
                  ))}
                </div>
              </div>
              <div className="summary">{item.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
