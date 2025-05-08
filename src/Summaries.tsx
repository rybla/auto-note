import { ReactNode, useEffect, useState } from "react";
import "./Summaries.css";
import { FeedItem, SummarizedFeedItem } from "./common/type";
import { do_ } from "./utilities";
import { summaries_catalogue_filename, summaries_dir } from "./common/uri";
import Status from "./Status";

export default function Summaries(props: {}) {
  const [status, modify_status] = useState<string | undefined>(
    "loading items...",
  );

  const [items, modify_items] = useState<SummarizedFeedItem[]>([]);
  const [itemsAll, modify_itemsAll] = useState<SummarizedFeedItem[]>([]);

  const [categories, modify_categories] = useState<Set<string>>(new Set());
  const [categoriesActive, modify_categoriesActive] = useState<Set<string>>(
    new Set(),
  );

  function render_category(category: string) {
    const active = categoriesActive.has(category);
    return (
      <div
        key={category}
        className={`category ${categoriesActive.size === 0 ? "" : active ? "active" : "inactive"}`}
        onClick={() => {
          if (active) {
            modify_categoriesActive(
              categoriesActive.difference(new Set([category])),
            );
          } else {
            modify_categoriesActive(
              categoriesActive.union(new Set([category])),
            );
          }
        }}
      >
        {category}
      </div>
    );
  }

  useEffect(() => {
    do_(async () => {
      try {
        const items: SummarizedFeedItem[] = await (
          await fetch(`${summaries_dir}/${summaries_catalogue_filename}`)
        ).json();
        modify_items(items);
        modify_itemsAll(items);
        const categories_strings = new Set(
          items.flatMap((item) => item.categories ?? []),
        );
        modify_categories(categories_strings);
        modify_categoriesActive(new Set());
        modify_status(undefined);
      } catch (e: any) {
        modify_status(`error fetching feed item catalogue: ${e.toString()}`);
      }
    });
  }, []);

  useEffect(() => {
    if (categoriesActive.size === 0) {
      modify_items(itemsAll);
    } else {
      modify_items(
        itemsAll.filter((item) => {
          return (
            categoriesActive.intersection(new Set(item.categories ?? [])).size >
            0
          );
        }),
      );
    }
  }, [categoriesActive]);

  return (
    <div className="Summaries panel">
      <div className="title">Summaries</div>
      {status === undefined ? <></> : <Status content={status} />}
      <div className="body">
        <div className="categories-filler"></div>
        <div className="categories">
          {do_(() => {
            const elements: ReactNode[] = [];
            var i = 0;
            for (const category of Array(...categories).toSorted()) {
              const active = categoriesActive.has(category);
              elements.push(render_category(category));
              i++;
            }
            return elements;
          })}
        </div>
        <div className="items">
          {items.map((item, i) => (
            <>
              <hr key={i} />
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
                <div className="pubDate">{item.pubDate}</div>
                <div className="categories">
                  {(item.categories ?? []).map(render_category)}
                </div>
                <div className="summary">{item.summary}</div>
              </div>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
