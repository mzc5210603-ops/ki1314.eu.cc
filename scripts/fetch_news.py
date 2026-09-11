#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NewsHub - 新闻数据抓取脚本
支持多数据源：RSS、Hacker News API 等
设计原则：容错性强，任一数据源失败不影响整体结果
"""

import json
import os
import re
import sys
import time
import random
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

import requests
import feedparser
from dateutil import parser as date_parser

# ================= 配置 =================

# 项目根目录（脚本位于 scripts/，向上一级）
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data.json"

# 时区：北京时间
TZ_BJ = timezone(timedelta(hours=8))

# 每个数据源最多取多少条
MAX_PER_SOURCE = 30

# 总条数上限
MAX_TOTAL_ARTICLES = 150

# 请求超时（秒）
REQUEST_TIMEOUT = 20

# 分类映射表（将各种来源的分类映射到标准分类）
CATEGORY_MAP = {
    # 英文
    "technology": "tech", "tech": "tech", "science": "science",
    "business": "business", "finance": "business", "economy": "business",
    "sports": "sports", "sport": "sports", "football": "sports",
    "entertainment": "entertainment", "ent": "entertainment",
    "movies": "entertainment", "music": "entertainment", "gaming": "entertainment",
    "health": "health", "medical": "health", "wellness": "health",
    "world": "world", "international": "world", "global": "world",
    "politics": "world", "general": "all", "news": "all", "top": "all",
    # 中文
    "科技": "tech", "技术": "tech", "数码": "tech", "IT": "tech",
    "财经": "business", "经济": "business", "金融": "business", "股票": "business",
    "体育": "sports", "运动": "sports", "足球": "sports", "篮球": "sports",
    "娱乐": "entertainment", "明星": "entertainment", "电影": "entertainment",
    "音乐": "entertainment", "综艺": "entertainment",
    "健康": "health", "医疗": "health", "养生": "health",
    "科学": "science", "科普": "science",
    "国际": "world", "全球": "world", "环球": "world",
    "综合": "all", "资讯": "all", "要闻": "all"
}

# ================= 日志 =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("fetch_news")

# ================= HTTP 工具 =================

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def http_get(url: str, **kwargs) -> Optional[requests.Response]:
    """安全的 HTTP GET 请求，带超时、重试、UA 伪装"""
    headers = kwargs.pop("headers", {})
    headers.setdefault("User-Agent", random.choice(USER_AGENTS))
    headers.setdefault("Accept", "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8")
    headers.setdefault("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

    attempts = kwargs.pop("retries", 2) + 1
    for i in range(attempts):
        try:
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, **kwargs)
            if resp.status_code == 200:
                return resp
            logger.warning(f"HTTP {resp.status_code} for {url} (attempt {i+1}/{attempts})")
        except Exception as e:
            logger.warning(f"请求失败 {url}: {e} (attempt {i+1}/{attempts})")
        if i < attempts - 1:
            time.sleep(1.5 * (i + 1))
    return None


# ================= 通用工具 =================

def normalize_category(raw: Optional[str]) -> str:
    if not raw:
        return "all"
    r = str(raw).strip().lower()
    return CATEGORY_MAP.get(r, CATEGORY_MAP.get(raw.strip(), "all"))


def clean_html(text: Optional[str]) -> str:
    if not text:
        return ""
    # 去 HTML 标签
    text = re.sub(r"<[^>]+>", "", text)
    # 去多余空白
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_date(val: Any) -> str:
    """解析各种日期格式为 ISO 字符串"""
    if not val:
        return datetime.now(TZ_BJ).isoformat()
    try:
        if isinstance(val, (int, float)):
            dt = datetime.fromtimestamp(val, tz=timezone.utc)
        elif isinstance(val, datetime):
            dt = val
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = date_parser.parse(str(val), fuzzy=True)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TZ_BJ).isoformat()
    except Exception:
        return datetime.now(TZ_BJ).isoformat()


def make_id(*parts: Any) -> str:
    s = "|".join(str(p) for p in parts if p)
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def extract_tags(title: str, summary: str, content: str = "") -> List[str]:
    """简单关键词提取（用于补充 tags）"""
    tags = []
    text = f"{title} {summary} {content}"

    keyword_map = {
        "AI": ["AI", "人工智能", "机器学习", "深度学习", "大模型", "LLM", "GPT", "AIGC", "生成式"],
        "开源": ["开源", "open source", "GitHub", "MIT License", "Apache License"],
        "芯片": ["芯片", "半导体", "GPU", "CPU", "制程", "NVIDIA", "英伟达", "Intel", "高通"],
        "手机": ["手机", "智能手机", "iPhone", "安卓", "Android", "华为", "小米", "OPPO", "vivo", "三星"],
        "电动车": ["电动车", "电动汽车", "新能源汽车", "特斯拉", "比亚迪", "蔚来", "小鹏", "理想", "电池"],
        "5G": ["5G", "6G", "通信", "基站"],
        "区块链": ["区块链", "Web3", "加密货币", "比特币", "BTC", "以太坊", "ETH", "NFT"],
        "元宇宙": ["元宇宙", "VR", "AR", "MR", "虚拟现实"],
        "自动驾驶": ["自动驾驶", "无人驾驶", "自动驾驶", "L4", "L5"],
        "太空": ["太空", "航天", "NASA", "SpaceX", "火星", "火箭", "卫星"],
        "量子": ["量子", "量子计算", "量子通信"],
        "股市": ["股市", "股票", "大盘", "A股", "美股", "港股", "纳斯达克", "上证"],
        "投资": ["投资", "融资", "IPO", "上市", "估值", "并购", "创投"],
        "房地产": ["房地产", "楼市", "房价", "房贷"],
        "世界杯": ["世界杯", "欧洲杯", "奥运会", "亚运会"],
        "NBA": ["NBA", "CBA", "篮球", "詹姆斯", "库里", "科比"],
        "足球": ["足球", "欧冠", "英超", "西甲", "意甲", "德甲", "中超", "梅西", "C罗"],
        "疫情": ["疫情", "新冠", "病毒", "疫苗"],
        "中美": ["中美", "中美关系", "中美贸易"],
    }

    for tag, keywords in keyword_map.items():
        for kw in keywords:
            if kw.lower() in text.lower():
                tags.append(tag)
                break
    return tags


def dedupe_articles(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """按标题去重（忽略中英文空白与大小写）"""
    seen = set()
    result = []
    for a in articles:
        key = re.sub(r"\s+", "", a.get("title", "")).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(a)
    return result


# ================= 数据源 1：Hacker News（公开 API，无需 Key）=================

def fetch_hackernews() -> List[Dict[str, Any]]:
    logger.info("抓取 Hacker News ...")
    articles = []
    try:
        # 取 Top Stories
        top_resp = http_get("https://hacker-news.firebaseio.com/v0/topstories.json")
        if not top_resp:
            return articles
        ids = top_resp.json()
        if not isinstance(ids, list):
            return articles

        for item_id in ids[:MAX_PER_SOURCE]:
            detail_resp = http_get(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json")
            if not detail_resp:
                continue
            item = detail_resp.json() or {}
            if not item.get("title"):
                continue

            title = item["title"].strip()
            url = item.get("url") or f"https://news.ycombinator.com/item?id={item_id}"
            score = item.get("score", 0)
            published = parse_date(item.get("time"))
            by = item.get("by", "Hacker News")

            summary = f"Hacker News 热门帖 · 得分 {score} · by {by}"
            tags = extract_tags(title, summary)
            tags.insert(0, "HackerNews")

            articles.append({
                "id": make_id("hn", item_id),
                "title": title,
                "summary": summary,
                "url": url,
                "image": "",
                "category": "tech",
                "source": "Hacker News",
                "author": by,
                "publishedAt": published,
                "tags": list(dict.fromkeys(tags)),
                "popularity": int(score) * 10 + 500,
            })
            time.sleep(0.05)  # 轻微限速
    except Exception as e:
        logger.error(f"HackerNews 抓取异常: {e}")
    logger.info(f"HackerNews 抓到 {len(articles)} 条")
    return articles


# ================= 数据源 2：BBC 公开 RSS =================

def fetch_bbc_rss() -> List[Dict[str, Any]]:
    logger.info("抓取 BBC News RSS ...")
    feeds = {
        "world": "http://feeds.bbci.co.uk/news/world/rss.xml",
        "tech": "http://feeds.bbci.co.uk/news/technology/rss.xml",
        "business": "http://feeds.bbci.co.uk/news/business/rss.xml",
        "sports": "http://feeds.bbci.co.uk/sport/rss.xml?edition=int",
        "entertainment": "http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
        "health": "http://feeds.bbci.co.uk/news/health/rss.xml",
        "science": "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    }
    articles = []
    for cat, url in feeds.items():
        try:
            resp = http_get(url)
            if not resp:
                continue
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:8]:
                title = clean_html(entry.get("title"))
                if not title:
                    continue
                summary = clean_html(entry.get("summary") or entry.get("description"))[:240]
                link = entry.get("link", "")
                published = parse_date(entry.get("published") or entry.get("updated"))
                tags_raw = [t.get("term", "") for t in entry.get("tags", []) if t.get("term")]

                # 尝试提取缩略图
                image = ""
                for thumb in entry.get("media_thumbnail", []) or entry.get("media_content", []):
                    if isinstance(thumb, dict) and thumb.get("url"):
                        image = thumb["url"]
                        break

                tags = extract_tags(title, summary)
                for t in tags_raw:
                    if len(t) <= 20 and t.lower() not in [x.lower() for x in tags]:
                        tags.append(t)

                category = normalize_category(cat)
                articles.append({
                    "id": make_id("bbc", link or title),
                    "title": title,
                    "summary": summary,
                    "url": link,
                    "image": image,
                    "category": category,
                    "source": "BBC News",
                    "author": "BBC",
                    "publishedAt": published,
                    "tags": list(dict.fromkeys(tags))[:6],
                    "popularity": random.randint(2000, 12000),
                })
        except Exception as e:
            logger.error(f"BBC RSS 抓取异常 ({cat}): {e}")
    logger.info(f"BBC RSS 抓到 {len(articles)} 条")
    return articles


# ================= 数据源 3：CNN 公开 RSS =================

def fetch_cnn_rss() -> List[Dict[str, Any]]:
    logger.info("抓取 CNN RSS ...")
    feeds = {
        "world": "http://rss.cnn.com/rss/edition_world.rss",
        "business": "http://rss.cnn.com/rss/money_latest.rss",
        "tech": "http://rss.cnn.com/rss/edition_technology.rss",
        "sports": "http://rss.cnn.com/rss/edition_sport.rss",
        "entertainment": "http://rss.cnn.com/rss/edition_entertainment.rss",
        "health": "http://rss.cnn.com/rss/edition_health.rss",
    }
    articles = []
    for cat, url in feeds.items():
        try:
            resp = http_get(url)
            if not resp:
                continue
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:8]:
                title = clean_html(entry.get("title"))
                if not title:
                    continue
                summary = clean_html(entry.get("summary") or entry.get("description"))[:240]
                link = entry.get("link", "")
                published = parse_date(entry.get("published") or entry.get("updated"))

                image = ""
                media = entry.get("media_content") or entry.get("media_thumbnail") or []
                for m in media:
                    if isinstance(m, dict) and m.get("url"):
                        image = m["url"]
                        break

                tags = extract_tags(title, summary)
                category = normalize_category(cat)

                articles.append({
                    "id": make_id("cnn", link or title),
                    "title": title,
                    "summary": summary,
                    "url": link,
                    "image": image,
                    "category": category,
                    "source": "CNN",
                    "author": "CNN",
                    "publishedAt": published,
                    "tags": list(dict.fromkeys(tags))[:6],
                    "popularity": random.randint(2500, 15000),
                })
        except Exception as e:
            logger.error(f"CNN RSS 抓取异常 ({cat}): {e}")
    logger.info(f"CNN RSS 抓到 {len(articles)} 条")
    return articles


# ================= 数据源 4：路透社 RSS =================

def fetch_reuters_rss() -> List[Dict[str, Any]]:
    logger.info("抓取 Reuters RSS ...")
    feeds = {
        "world": "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best",
        "business": "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best",
        "tech": "https://www.reutersagency.com/feed/?best-topics=tech&post_type=best",
    }
    articles = []
    for cat, url in feeds.items():
        try:
            resp = http_get(url)
            if not resp:
                continue
            feed = feedparser.parse(resp.content)
            for entry in feed.entries[:10]:
                title = clean_html(entry.get("title"))
                if not title:
                    continue
                summary = clean_html(entry.get("summary") or entry.get("description"))[:260]
                link = entry.get("link", "")
                published = parse_date(entry.get("published") or entry.get("updated"))
                tags = extract_tags(title, summary)
                category = normalize_category(cat)

                articles.append({
                    "id": make_id("reuters", link or title),
                    "title": title,
                    "summary": summary,
                    "url": link,
                    "image": "",
                    "category": category,
                    "source": "Reuters",
                    "author": "Reuters",
                    "publishedAt": published,
                    "tags": list(dict.fromkeys(tags))[:6],
                    "popularity": random.randint(3000, 14000),
                })
        except Exception as e:
            logger.error(f"Reuters RSS 抓取异常 ({cat}): {e}")
    logger.info(f"Reuters RSS 抓到 {len(articles)} 条")
    return articles


# ================= 数据源 5：Dev.to（开发者社区公开 API）=================

def fetch_devto() -> List[Dict[str, Any]]:
    logger.info("抓取 Dev.to ...")
    articles = []
    try:
        resp = http_get(
            "https://dev.to/api/articles",
            params={"top": 7, "per_page": MAX_PER_SOURCE}
        )
        if not resp:
            return articles
        data = resp.json()
        for item in data:
            title = (item.get("title") or "").strip()
            if not title:
                continue
            summary = clean_html(item.get("description") or item.get("body_markdown", "")[:200])[:240]
            url = item.get("url") or ""
            image = item.get("cover_image") or item.get("social_image") or ""
            published = parse_date(item.get("published_at"))
            author = (item.get("user") or {}).get("name") or "Dev.to"
            tags_raw = item.get("tag_list") or item.get("tags") or []

            tags = extract_tags(title, summary)
            tags.extend([t for t in tags_raw if isinstance(t, str) and len(t) <= 20])

            articles.append({
                "id": make_id("devto", item.get("id") or url),
                "title": title,
                "summary": summary,
                "url": url,
                "image": image,
                "category": "tech",
                "source": "Dev.to",
                "author": author,
                "publishedAt": published,
                "tags": list(dict.fromkeys(tags))[:6],
                "popularity": int(item.get("positive_reactions_count", 0)) * 20 + 800,
            })
    except Exception as e:
        logger.error(f"Dev.to 抓取异常: {e}")
    logger.info(f"Dev.to 抓到 {len(articles)} 条")
    return articles


# ================= 数据源 6（可选）：NewsAPI（需要 API Key）=================

def fetch_newsapi() -> List[Dict[str, Any]]:
    """如果配置了 NEWS_API_KEY 环境变量，则启用 NewsAPI 抓取"""
    api_key = os.environ.get("NEWS_API_KEY")
    if not api_key:
        logger.info("跳过 NewsAPI（未配置 NEWS_API_KEY）")
        return []

    logger.info("抓取 NewsAPI ...")
    articles = []
    endpoints = [
        ("top-headlines", {"country": "us", "pageSize": 30}),
        ("top-headlines", {"category": "technology", "pageSize": 20}),
        ("top-headlines", {"category": "business", "pageSize": 20}),
        ("top-headlines", {"category": "science", "pageSize": 15}),
        ("top-headlines", {"category": "health", "pageSize": 15}),
        ("top-headlines", {"category": "sports", "pageSize": 15}),
        ("top-headlines", {"category": "entertainment", "pageSize": 15}),
    ]
    for ep, params in endpoints:
        try:
            params["apiKey"] = api_key
            resp = http_get(f"https://newsapi.org/v2/{ep}", params=params)
            if not resp:
                continue
            data = resp.json()
            for a in data.get("articles", []):
                title = (a.get("title") or "").strip()
                if not title or title.startswith("[Removed]"):
                    continue
                source = (a.get("source") or {}).get("name") or "NewsAPI"
                summary = clean_html(a.get("description") or a.get("content") or "")[:260]
                url = a.get("url") or ""
                image = a.get("urlToImage") or ""
                published = parse_date(a.get("publishedAt"))
                cat = params.get("category") or "all"

                tags = extract_tags(title, summary)
                articles.append({
                    "id": make_id("newsapi", url or title),
                    "title": title,
                    "summary": summary,
                    "url": url,
                    "image": image,
                    "category": normalize_category(cat),
                    "source": source,
                    "author": a.get("author") or source,
                    "publishedAt": published,
                    "tags": list(dict.fromkeys(tags))[:6],
                    "popularity": random.randint(4000, 20000),
                })
        except Exception as e:
            logger.error(f"NewsAPI 抓取异常 ({ep}): {e}")
    logger.info(f"NewsAPI 抓到 {len(articles)} 条")
    return articles


# ================= 数据源 7（可选）：GNews（需要 API Key）=================

def fetch_gnews() -> List[Dict[str, Any]]:
    api_key = os.environ.get("GNEWS_API_KEY")
    if not api_key:
        logger.info("跳过 GNews（未配置 GNEWS_API_KEY）")
        return []
    logger.info("抓取 GNews ...")
    articles = []
    for topic in ["world", "technology", "business", "sports", "science", "health", "entertainment"]:
        try:
            resp = http_get("https://gnews.io/api/v4/top-headlines", params={
                "topic": topic,
                "lang": "en",
                "max": 10,
                "token": api_key,
            })
            if not resp:
                continue
            data = resp.json()
            for a in data.get("articles", []):
                title = (a.get("title") or "").strip()
                if not title:
                    continue
                articles.append({
                    "id": make_id("gnews", a.get("url") or title),
                    "title": title,
                    "summary": clean_html(a.get("description") or a.get("content") or "")[:260],
                    "url": a.get("url") or "",
                    "image": a.get("image") or "",
                    "category": normalize_category(topic),
                    "source": (a.get("source") or {}).get("name", "GNews"),
                    "author": (a.get("source") or {}).get("name", "GNews"),
                    "publishedAt": parse_date(a.get("publishedAt")),
                    "tags": extract_tags(title, a.get("description", "")),
                    "popularity": random.randint(3500, 18000),
                })
        except Exception as e:
            logger.error(f"GNews 抓取异常 ({topic}): {e}")
    logger.info(f"GNews 抓到 {len(articles)} 条")
    return articles


# ================= 主流程 =================

def collect_all() -> List[Dict[str, Any]]:
    """串行调用所有数据源并合并"""
    sources = [
        fetch_hackernews,
        fetch_bbc_rss,
        fetch_cnn_rss,
        fetch_reuters_rss,
        fetch_devto,
        fetch_newsapi,
        fetch_gnews,
    ]

    all_articles: List[Dict[str, Any]] = []
    for fn in sources:
        try:
            batch = fn()
            all_articles.extend(batch)
        except Exception as e:
            logger.error(f"数据源 {fn.__name__} 整体失败: {e}")

    logger.info(f"合并后共 {len(all_articles)} 条，开始去重...")
    all_articles = dedupe_articles(all_articles)
    logger.info(f"去重后剩 {len(all_articles)} 条")

    # 按发布时间降序，再截取总数上限
    all_articles.sort(
        key=lambda x: (x.get("publishedAt") or "", x.get("popularity") or 0),
        reverse=True,
    )
    all_articles = all_articles[:MAX_TOTAL_ARTICLES]

    return all_articles


def save_output(articles: List[Dict[str, Any]]) -> None:
    payload = {
        "updatedAt": datetime.now(TZ_BJ).isoformat(),
        "total": len(articles),
        "articles": articles,
    }
    # 先写到临时文件再替换，避免写入中断导致空文件
    tmp = DATA_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    tmp.replace(DATA_FILE)
    logger.info(f"已写入 {DATA_FILE}，共 {len(articles)} 条资讯")


def main() -> int:
    logger.info("========== 新闻抓取任务启动 ==========")
    t0 = time.time()
    try:
        articles = collect_all()
        if not articles:
            logger.warning("所有数据源均为空，为避免覆盖已有 data.json，本次不写入")
            # 若 data.json 不存在，输出一个空壳占位
            if not DATA_FILE.exists():
                save_output([])
            return 1
        save_output(articles)
        logger.info(f"任务完成，耗时 {time.time() - t0:.1f}s")
        return 0
    except Exception as e:
        logger.critical(f"主流程崩溃: {e}", exc_info=True)
        return 2


if __name__ == "__main__":
    sys.exit(main())
